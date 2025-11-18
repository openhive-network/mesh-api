#!/bin/bash
set -e

# This was done in a "move fast and break things" manner and should to be optimized in future releases but it works

# Helper functions
error_exit() {
    echo "ERROR: $1" >&2
    exit 1
}

verify_checksum() {
    local file="$1"
    local expected_checksum="$2"
    local algorithm="${3:-sha256}"

    echo "Verifying checksum for $file..."
    local actual_checksum
    case "$algorithm" in
        sha256)
            actual_checksum=$(sha256sum "$file" | awk '{print $1}')
            ;;
        sha512)
            actual_checksum=$(sha512sum "$file" | awk '{print $1}')
            ;;
        *)
            error_exit "Unsupported checksum algorithm: $algorithm"
            ;;
    esac

    if [ "$actual_checksum" != "$expected_checksum" ]; then
        error_exit "Checksum verification failed for $file. Expected: $expected_checksum, Got: $actual_checksum"
    fi
    echo "Checksum verified successfully for $file"
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        error_exit "$1 is not installed or not in PATH"
    fi
}

# install postgres
export DEBIAN_FRONTEND=noninteractive
export TZ=Europe/London

apt update || error_exit "Failed to update package lists"
apt install -y gnupg lsb-release wget sudo || error_exit "Failed to install base dependencies"

sh -c 'echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list' || error_exit "Failed to add PostgreSQL repository"
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg || error_exit "Failed to add PostgreSQL GPG key"

apt update || error_exit "Failed to update apt packages"
apt install -y postgresql-17 || error_exit "Failed to install PostgreSQL 17"
pg_ctlcluster 17 main start || error_exit "Failed to start PostgreSQL cluster"
sudo -i -u postgres psql -c 'alter role postgres password null;' || error_exit "Failed to configure postgres role"

# Configure PostgreSQL to listen on all interfaces
sudo -u postgres sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" /etc/postgresql/17/main/postgresql.conf

sudo sh -c 'cat > /etc/postgresql/17/main/pg_hba.conf << EOF
# TYPE  DATABASE        USER            ADDRESS                 METHOD

# "local" is for Unix domain socket connections only
local   all             all                                     trust
# IPv4 local connections:
host    all             all             127.0.0.1/32            trust
# IPv6 local connections:
host    all             all             ::1/128                 trust
# Allow replication connections from localhost, by a user with the
# replication privilege.
local   replication     all                                     trust
host    replication     all             127.0.0.1/32            trust
host    replication     all             ::1/128                 trust
# Allow connections from within the Docker network
host    all             all             0.0.0.0/0               trust
EOF'
pg_ctlcluster 17 main restart || error_exit "Failed to restart PostgreSQL cluster"

# install the rest
apt install git -y
apt install software-properties-common -y

git clone https://gitlab.syncad.com/hive/HAfAH.git || error_exit "Failed to clone HAfAH repository"
cd HAfAH/
git checkout 1.27.12rc2 || error_exit "Failed to checkout HAfAH version 1.27.12rc2"
git submodule update --init --recursive || error_exit "Failed to update HAfAH submodules"

add-apt-repository universe -y
apt-get update && apt-get install -y \
git python3 build-essential gir1.2-glib-2.0 libgirepository-1.0-1 libglib2.0-0 libglib2.0-data libxml2 python3-setuptools python3-lib2to3 python3-pkg-resources shared-mime-info xdg-user-dirs ca-certificates autoconf automake cmake clang clang-tidy g++ git libbz2-dev libsnappy-dev libssl-dev libtool make pkg-config python3-jinja2 doxygen libncurses-dev libreadline-dev perl ninja-build xxd liburing-dev screen python3-pip python3-dateutil tzdata python3-junit.xml python3-venv python3-dateutil python3-dev p7zip-full software-properties-common libpqxx-dev postgresql-server-dev-all zopfli acl

# build boost
cd /tmp
wget https://archives.boost.io/release/1.74.0/source/boost_1_74_0.tar.gz || error_exit "Failed to download boost"
verify_checksum "boost_1_74_0.tar.gz" "afff36d392885120bcac079148c177d1f6f7730ec3d47233aa51b0afa4db94a5"
tar xf boost_1_74_0.tar.gz || error_exit "Failed to extract boost archive"
cd boost_1_74_0
cpuCores=$(cat /proc/cpuinfo | grep "cpu cores" | uniq | awk '{print $NF}')
echo "Available CPU cores: "$cpuCores
./bootstrap.sh || error_exit "Failed to bootstrap boost"
sudo ./b2 --with=all -j $cpuCores install || error_exit "Failed to build and install boost"

sudo ldconfig
pip3 install -U secp256k1prp --break-system-packages || error_exit "Failed to install secp256k1prp"

cd /HAfAH/haf
mkdir build || error_exit "Failed to create build directory"
cd build

cmake -DPOSTGRES_INSTALLATION_DIR=/usr/lib/postgresql/17/bin -DCMAKE_BUILD_TYPE=Release .. -GNinja || error_exit "Failed to configure HAF with cmake"

ninja -j8 || error_exit "Failed to build HAF with ninja"
ninja install || error_exit "Failed to install HAF"

sudo setfacl -R -m u:postgres:rwx /HAfAH/haf/ || error_exit "Failed to set permissions on HAF directory"
cd ../scripts/
./setup_postgres.sh --install-extension=yes,/HAfAH/haf/build || error_exit "Failed to setup PostgreSQL extensions"
./setup_db.sh --haf-db-admin=postgres || error_exit "Failed to setup HAF database"

# config.ini
mkdir -p /root/.hived || error_exit "Failed to create .hived directory"
cd /root/.hived

cat << 'EOF' > config.ini
log-appender = {"appender":"stderr","stream":"std_error"}
log-logger = {"name":"default","level":"info","appender":"stderr"}
backtrace = yes
plugin = webserver p2p json_rpc
plugin = database_api
# condenser_api enabled per abw request
plugin = condenser_api
# gandalf enabled witness + rc

# market_history enabled per abw request
plugin = market_history
plugin = market_history_api

plugin = account_history_rocksdb
plugin = account_history_api

# gandalf enabled transaction status
plugin = transaction_status
plugin = transaction_status_api

# gandalf enabled account by key
plugin = account_by_key
plugin = account_by_key_api

plugin = network_node_api

# and few apis
plugin = block_api network_broadcast_api rc_api

history-disable-pruning = 1
account-history-rocksdb-path = "blockchain/account-history-rocksdb-storage"

# shared-file-dir = "/run/hive"
shared-file-size = 2G
shared-file-full-threshold = 9500
shared-file-scale-rate = 1000

flush-state-interval = 0

market-history-bucket-size = [15,60,300,3600,86400]
market-history-buckets-per-size = 5760

p2p-endpoint = 0.0.0.0:2001


transaction-status-block-depth = 64000
transaction-status-track-after-block = 42000000

webserver-http-endpoint = 0.0.0.0:8091
webserver-ws-endpoint = 0.0.0.0:8090

webserver-thread-pool-size = 8
plugin = sql_serializer
psql-url = dbname=haf_block_log user=postgres hostaddr=127.0.0.1 port=5432
psql-index-threshold = 1000000
psql-operations-threads-number = 5
psql-transactions-threads-number = 2
psql-account-operations-threads-number = 2
psql-enable-account-operations-dump = true
psql-force-open-inconsistent = false
psql-livesync-threshold = 100000
psql-track-operations=transfer_operation
psql-track-operations=claim_reward_balance_operation
psql-track-operations=transfer_to_savings_operation
psql-track-operations=collateralized_convert_operation
psql-track-operations=convert_operation
psql-track-operations=limit_order_create_operation
psql-track-operations=limit_order_create2_operation
psql-track-operations=transfer_to_vesting_operation
psql-track-operations=account_create_operation
psql-track-operations=account_create_with_delegation_operation
psql-track-operations=escrow_transfer_operation
psql-track-operations=escrow_release_operation
psql-track-operations=fill_recurrent_transfer_operation
psql-track-operations=fill_transfer_from_savings_operation
psql-track-operations=interest_operation
psql-track-operations=fill_convert_request_operation
psql-track-operations=limit_order_cancelled_operation
psql-track-operations=fill_order_operation
psql-track-operations=fill_collateralized_convert_request_operation
psql-track-operations=collateralized_convert_immediate_conversion_operation
psql-track-operations=fill_vesting_withdraw_operation
psql-track-operations=liquidity_reward_operation
psql-track-operations=escrow_approved_operation
psql-track-operations=escrow_rejected_operation
psql-track-operations=proposal_fee_operation
psql-track-operations=proposal_pay_operation
psql-track-operations=hardfork_hive_operation
psql-track-operations=hardfork_hive_restore_operation
EOF

# restart postgres ahead of sync
pg_ctlcluster 17 main restart || error_exit "Failed to restart PostgreSQL before sync"


# install node
wget https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh || error_exit "Failed to download NVM install script"
verify_checksum "install.sh" "bdea8c52186c4dd12657e77e7515509cda5bf9fa5a2f0046bce749e62645076d"
chmod +x install.sh
./install.sh || error_exit "Failed to install NVM"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" || error_exit "Failed to load nvm"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

nvm install 22 || error_exit "Failed to install Node.js 22"
npm install -g pm2 || error_exit "Failed to install pm2"

pm2 start "/HAfAH/haf/build/hive/programs/hived/hived" --name hived || error_exit "Failed to start hived with pm2"

cd /tmp
wget https://github.com/PostgREST/postgrest/releases/download/v12.2.8/postgrest-v12.2.8-linux-static-x86-64.tar.xz || error_exit "Failed to download PostgREST"
verify_checksum "postgrest-v12.2.8-linux-static-x86-64.tar.xz" "7da60261909ab7e6fc2f0c0c1d484985f17710151e1c94e8229559eaa23cd611"
tar xf postgrest-v12.2.8-linux-static-x86-64.tar.xz || error_exit "Failed to extract PostgREST archive"
mv postgrest /usr/bin/ || error_exit "Failed to move postgrest to /usr/bin"

cd /HAfAH/scripts
./setup_postgres.sh --host=127.0.0.1 || error_exit "Failed to run setup_postgres.sh"
./generate_version_sql.bash .. || error_exit "Failed to generate version SQL"
./install_app.sh --host=127.0.0.1 || error_exit "Failed to install HAfAH app"


cat << 'EOF' > postgrest.conf
db-uri = "postgresql://haf_admin@/haf_block_log"
db-schema = "hafah_endpoints"
db-anon-role = "hafah_user"
db-root-spec = "home"
server-port = 3000
EOF

pm2 start "postgrest postgrest.conf" --name hafah || error_exit "Failed to start PostgREST with pm2"

cd /
apt install cargo -y || error_exit "Failed to install cargo"
git clone https://gitlab.syncad.com/hive/drone.git || error_exit "Failed to clone drone repository"
cd drone
git checkout efa51aa744888380fabe65f86b36983ac3cf79b8
cargo build --release || error_exit "Failed to build drone"


cat << 'EOF' > config.yaml
---
drone:
  port: 4000
  hostname: 0.0.0.0
  cache_max_capacity: 4294967296 # 4GB
  operator_message: "Drone"
  middleware_connection_threads: 8
# The remainder of this file is based on the information in existing jussi config files,
# just in a more concise yaml format.

# a list of backends Drone will send calls to, these are referenced
# in the 'urls' section
backends:
  hived: http://127.0.0.1:8091
  hafah: http://127.0.0.1:3000

translate_to_appbase:
  - hived

urls:
  hived: hived
  hived.network_broadcast_api.broadcast_transaction_synchronous: hived
  appbase: hived
  appbase.condenser_api.get_accounts: hived
  appbase.condenser_api.broadcast_block: hived
  appbase.condenser_api.broadcast_transaction: hived
  appbase.condenser_api.broadcast_transaction_synchronous: hived
  appbase.network_broadcast_api.broadcast_transaction_synchronous: hived
  appbase.network_broadcast_api: hived
  appbase.condenser_api.get_block: hived
  appbase.block_api.get_block: hafah
  appbase.block_api.get_block_header: hafah
  appbase.block_api.get_block_range: hafah
  appbase.account_history_api.get_account_history: hafah
  appbase.account_history_api.get_ops_in_block: hafah
  appbase.account_history_api.enum_virtual_ops: hafah
  appbase.account_history_api.get_transaction: hafah
  appbase.condenser_api.get_account_history: hafah
  appbase.condenser_api.get_ops_in_block: hafah
  appbase.condenser_api.enum_virtual_ops: hafah
  appbase.condenser_api.get_transaction: hafah

ttls:
  hived: 3
  hived.login_api: NO_CACHE
  hived.network_broadcast_api: NO_CACHE
  hived.follow_api: 10
  hived.market_history_api: 1
  hived.database_api: 3
  hived.database_api.get_block: EXPIRE_IF_REVERSIBLE
  hived.database_api.get_block_header: EXPIRE_IF_REVERSIBLE
  hived.database_api.get_content: 1
  hived.database_api.get_state: 1
  hived.database_api.get_dynamic_global_properties: 1
  appbase: 1
  appbase.block_api: EXPIRE_IF_REVERSIBLE
  appbase.block_api.get_block_range: NO_CACHE
  appbase.database_api: 1
  appbase.condenser_api.get_account_reputations: 3600
  appbase.condenser_api.get_block: EXPIRE_IF_REVERSIBLE
  appbase.condenser_api.get_ticker: 1
  appbase.condenser_api.get_accounts: 6
  appbase.condenser_api.get_account_history: 6
  appbase.condenser_api.get_content: 6
  appbase.condenser_api.get_profile: 6
  appbase.database_api.find_accounts: 3
  appbase.condenser_api.get_dynamic_global_properties: 1
  hive: NO_CACHE
  bridge: NO_CACHE
  bridge.get_discussion: 6
  bridge.get_account_posts: 12
  bridge.get_ranked_posts: 6
  bridge.get_profile: 6
  bridge.get_community: 6
  bridge.get_post: 6
  bridge.get_trending_topics: 3

# how long to wait for the backend to respond before giving up
timeouts:
  bridge: 30
  hive: 30
  hived: 5
  hived.network_broadcast_api: 0
  appbase: 3
  appbase.chain_api.push_block: 0
  appbase.chain_api.push_transaction: 0
  appbase.network_broadcast_api: 0
  appbase.condenser_api.broadcast_block: 0
  appbase.condenser_api.broadcast_transaction: 0
  appbase.condenser_api.broadcast_transaction_synchronous: 0

equivalent_methods:
  destination_api.destination_method:
    - appbase.source_api.source_method

EOF

pm2 start "./target/release/drone" --name drone || error_exit "Failed to start drone with pm2"

cd /
git clone https://gitlab.syncad.com/hive/mesh-api.git || error_exit "Failed to clone mesh-api repository"
cd mesh-api
npm i || error_exit "Failed to install mesh-api dependencies"
pm2 start "src/app.js" --name mesh || error_exit "Failed to start mesh-api with pm2"


