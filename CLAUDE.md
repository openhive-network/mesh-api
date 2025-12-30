# mesh-api

Coinbase Mesh API implementation for the Hive blockchain. Provides standardized REST API for querying blockchain data and constructing transactions, enabling integration with exchanges and blockchain infrastructure.

## Tech Stack

- **Language:** JavaScript (Node.js, ES modules)
- **Framework:** Express.js
- **Key Dependencies:**
  - `@hiveio/wax` - Hive blockchain library (transaction signing, chain interaction)
  - `express` - Web framework
  - `node-fetch` - HTTP client
- **Infrastructure:** PostgreSQL 17, HAfAH (Account History API), hived (blockchain node), Docker

## Directory Structure

```
src/
├── app.js              # Express server setup, route mounting, error handling
├── network.js          # /network endpoints (list, status, options)
├── account.js          # /account endpoints (balance queries)
├── block.js            # /block endpoints (block/transaction retrieval)
├── construction.js     # /construction endpoints (transaction building)
├── opsProcessor.js     # Regular operation processing (13 op types)
├── virtualOpsProcessor.js  # Virtual operation processing (12+ op types)
└── test/
    └── testSign.js     # Transaction signing test script
docker/
├── docker-compose.yml  # Container orchestration
└── setup_script.sh     # Full stack setup (PostgreSQL, HAfAH, hived)
```

## Development Commands

```bash
# Install dependencies
npm install

# Run server (default port 4001)
node src/app.js

# Run with custom port
PORT=8080 node src/app.js

# Docker deployment
cd docker && docker-compose up -d
```

## Key Files

- `src/app.js` - Main entry point, Express server on port 4001
- `package.json` - Dependencies and project config
- `.npmrc` - Custom NPM registry for @hiveio packages
- `docker/setup_script.sh` - Complete infrastructure setup

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| POST /network/list | List available networks |
| POST /network/status | Current blockchain status |
| POST /network/options | Network capabilities, supported operations |
| POST /account/balance | Query HIVE/HBD balances |
| POST /block | Retrieve block by index/hash |
| POST /block/transaction | Get specific transaction |
| POST /construction/* | Transaction construction workflow |

## Coding Conventions

- ES6 modules (import/export)
- Async/await for all async operations
- Express router pattern for endpoint modules
- Input validation at endpoint entry
- Error format: `{ code, message, description, retriable, details }`
- NAI-based currency identification ("@@000000013" = HBD, default = HIVE)

## Configuration

- **API Port:** `PORT` env var (default: 4001)
- **Hive Node:** Hardcoded to `127.0.0.1:4000`
- **Error Detail:** `NODE_ENV=development` for verbose errors

## Limitations

- Construction only supports `transfer_operation` (not all 25 op types)
- Mempool endpoints unsupported (account-based blockchain, no UTXOs)
- Account derivation unsupported (requires on-chain action)
- Historical balance lookup not supported

## CI/CD

No `.gitlab-ci.yml` present. Docker-based deployment via `docker/docker-compose.yml`.
