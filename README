# Hive Blockchain Mesh API

This project implements the [Coinbase Mesh API specification](https://docs.cdp.coinbase.com/mesh/docs/getting-started) for the Hive blockchain, enabling standardized integration with exchanges and other blockchain infrastructure.

## Architecture

The project consists of several components:

1. **API Server**: Express.js application implementing the Mesh API endpoints
2. **Hived Node**: Core blockchain node feeding ops into a HAF database and supplying endpoints (eg: peer api)
3. **PostgreSQL**
4. **HAfAH**: Account history api, used mostly to get block operations
5. **Drone**: Middleware service to route calls to the various components

### Docker Setup

1. Start the Hive node, PostgreSQL, Drone, and HAfAH services:

```bash
cd docker
docker-compose up -d
```

This will:
- Start an Ubuntu container
- Download postgresql 17
- Build HiveD and HAF
- Run HAfAH and run it
- Run Drone
- Run the mesh api and expose it outside of the docker on port 4001

## API Endpoints

The Mesh API is divided into several groups of endpoints:

### Network Endpoints

- `POST /network/list`: List available networks (blockchain/network combinations)
- `POST /network/status`: Get the current status of the specified network
- `POST /network/options`: Get network-specific options

### Account Endpoints

- `POST /account/balance`: Get the balance of an account
- `POST /account/coins`: (Not supported for account-based blockchains like Hive)

### Block Endpoints

- `POST /block`: Get a block by index or hash
- `POST /block/transaction`: Get a transaction in a block by its hash

### Mempool Endpoints

- `POST /mempool`: (Not supported for Hive)
- `POST /mempool/transaction`: (Not supported for Hive)

### Construction Endpoints

- `POST /construction/derive`: (Not supported for Hive - accounts need on-chain action to be created)
- `POST /construction/preprocess`: Prepare information for transaction construction
- `POST /construction/metadata`: Get metadata needed for transaction construction
- `POST /construction/payloads`: Generate an unsigned transaction and signing payloads
- `POST /construction/parse`: Parse an unsigned or signed transaction
- `POST /construction/combine`: Combine signatures and an unsigned transaction
- `POST /construction/hash`: Get the hash of a signed transaction
- `POST /construction/submit`: Submit a signed transaction

## Supported Operations

The API supports the following Hive operations for tracking balance changes:

### Regular Operations
- `transfer_operation`
- `claim_reward_balance_operation`
- `transfer_to_savings_operation`
- `collateralized_convert_operation`
- `convert_operation`
- `limit_order_create_operation`
- `limit_order_create2_operation`
- `transfer_to_vesting_operation`
- `account_create_operation`
- `account_create_with_delegation_operation`
- `escrow_transfer_operation`
- `escrow_release_operation`

### Virtual Operations
- `fill_recurrent_transfer_operation`
- `fill_transfer_from_savings_operation`
- `interest_operation`
- `fill_convert_request_operation`
- `limit_order_cancelled_operation`
- `fill_order_operation`
- `fill_collateralized_convert_request_operation`
- `collateralized_convert_immediate_conversion_operation`
- `fill_vesting_withdraw_operation`
- `liquidity_reward_operation`
- `escrow_approved_operation`
- `escrow_rejected_operation`
- `proposal_fee_operation`
- `proposal_pay_operation`
- `hardfork_hive_operation`
- `hardfork_hive_restore_operation`

## Configuration

### API Server Configuration

The API server configuration is defined in `src/app.ts`. By default, it runs on port 4001, which can be changed using the `PORT` environment variable.

## Transaction Construction and Signing

For testing transaction construction and signing, you can use the provided script in `src/test/testSign.ts`. This script demonstrates how to:

1. Create an unsigned transaction
2. Sign it with a private key
3. Format the signed transaction for submission

## Troubleshooting

### Common Issues

1. **Node syncing issues**:
   If the node is having trouble syncing, you can check the logs:
   ```bash
   docker logs mesh
   ```

2. **API connectivity issues**:
   Make sure the HAF node and Drone middleware are running:
   ```bash
   docker exec mesh pm2 list
   ```

3. **Database issues**:
   Check the PostgreSQL service:
   ```bash
   docker exec mesh pg_ctlcluster 17 main status
   ```