#!/bin/bash
set -e

# install postgres
export DEBIAN_FRONTEND=noninteractive
export TZ=Europe/London

sh -c 'echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
apt update
apt install -y gnupg lsb-release wget sudo 

sh -c 'echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg

sh -c 'echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
apt update
apt install -y postgresql-17
pg_ctlcluster 17 main start
sudo -i -u postgres psql -c 'alter role postgres password null;'

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
pg_ctlcluster 17 main restart

# install the rest
apt install git -y
apt install software-properties-common -y

git clone https://gitlab.syncad.com/hive/haf.git && cd haf && git checkout 1.27.10

git submodule update --init --recursive
add-apt-repository universe -y
apt-get update && apt-get install -y \
git python3 build-essential gir1.2-glib-2.0 libgirepository-1.0-1 libglib2.0-0 libglib2.0-data libxml2 python3-setuptools python3-lib2to3 python3-pkg-resources shared-mime-info xdg-user-dirs ca-certificates autoconf automake cmake clang clang-tidy g++ git libbz2-dev libsnappy-dev libssl-dev libtool make pkg-config python3-jinja2 doxygen libncurses-dev libreadline-dev perl ninja-build xxd liburing-dev screen python3-pip python3-dateutil tzdata python3-junit.xml python3-venv python3-dateutil python3-dev p7zip-full software-properties-common libpqxx-dev postgresql-server-dev-all zopfli acl

# build boost
cd /tmp
wget https://archives.boost.io/release/1.74.0/source/boost_1_74_0.tar.gz
tar xf boost_1_74_0.tar.gz
cd boost_1_74_0
cpuCores=`cat /proc/cpuinfo | grep "cpu cores" | uniq | awk '{print $NF}'`
echo "Available CPU cores: "$cpuCores
./bootstrap.sh  # this will generate ./b2
sudo ./b2 --with=all -j $cpuCores install

sudo ldconfig
pip3 install -U secp256k1prp --break-system-packages

cd /haf
mkdir build && cd build

cmake -DPOSTGRES_INSTALLATION_DIR=/usr/lib/postgresql/17/bin -DCMAKE_BUILD_TYPE=Release .. -GNinja

ninja -j8
ninja install

sudo setfacl -R -m u:postgres:rwx /haf/
cd ../scripts/
./setup_postgres.sh --install-extension=yes,/haf/build
./setup_db.sh --haf-db-admin=postgres

# config.ini
mkdir -p /root/.hived && cd /root/.hived

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
EOF

# restart postgres ahead of sync
pg_ctlcluster 17 main restart


# install node
wget  https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh
chmod +x install.sh
./install.sh

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

nvm install 22
npm install -g pm2

pm2 start "/haf/build/hive/programs/hived/hived --stop-at-block 500000 --psql-index-threshold 65432" --name hived

cd /tmp
wget https://github.com/PostgREST/postgrest/releases/download/v12.2.8/postgrest-v12.2.8-linux-static-x86-64.tar.xz
tar xf postgrest-v12.2.8-linux-static-x86-64.tar.xz
mv postgrest /usr/bin/

cd /
git clone https://gitlab.syncad.com/hive/HAfAH.git
cd HAfAH/
git submodule update --init --recursive # TODO: this installs haf, we don't need to install haf individually then we should do everything from this
cd scripts
./setup_postgres.sh --host=127.0.0.1
./generate_version_sql.bash ..
./install_app.sh --host=127.0.0.1


cat << 'EOF' > postgrest.conf
db-uri = "postgresql://haf_admin@/haf_block_log"
db-schema = "hafah_endpoints"
db-anon-role = "hafah_user"
db-root-spec = "home"
server-port = 3000
EOF

pm2 start "postgrest postgrest.conf" --name hafah

cd /
apt install cargo -y
git clone https://gitlab.syncad.com/hive/drone.git
cd drone
cargo build --release


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

pm2 start "./target/release/drone" --name drone

cd /
git clone https://gitlab.syncad.com/hive/mesh-api.git
cd mesh-api
npm i
pm2 start "src/app.ts" --name mesh


