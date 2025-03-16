import express from 'express';
import {createHiveChain} from "@hiveio/wax";
const router = express.Router();

router.post('/list', async function(req,res) {
    const chain = await createHiveChain({
            apiEndpoint: "http://127.0.0.1:4000",
            restApiEndpoint: "http://127.0.0.1:4000"
});
    res.send({
        "network_identifiers": [
            {
                "blockchain": "hive",
                "network":  chain.chainId,
            }
        ]
    })
});

router.post('/status', async function(req, res) {
    try {
        // Validate required parameters
        const { network_identifier } = req.body || {};
        if (!network_identifier) {
            return res.status(400).json({ code: 400, message: "Missing network_identifier", retriable: false });
        }

        const { blockchain, network } = network_identifier;

        // Check blockchain and network values
        if (!blockchain || blockchain.toLowerCase() !== "hive") {
            return res.status(400).json({ code: 400, message: "Unsupported blockchain: must be 'hive'", retriable: false });
        }

        const chain = await createHiveChain({
            apiEndpoint: "http://127.0.0.1:4000",
            restApiEndpoint: "http://127.0.0.1:4000"
        });
        const expectedNetwork = chain.chainId;
        if (!network || network !== expectedNetwork) {
            return res.status(400).json({ code: 400, message: `Unsupported network: must be '${expectedNetwork}'`, retriable: false });
        }

        // Get blockchain data, genesis block, and connected peers
        const [chainData, genesisBlock, peerInfo] = await Promise.all([
            chain.api.database_api.get_dynamic_global_properties(),
            chain.api.block_api.get_block({ block_num: 1 }),
            chain.api.network_node_api.get_connected_peers()
        ]);

        // Format peer list for Rosetta API
        const peers = peerInfo.connected_peers.map(peer => ({
            peer_id: peer.host
        }));

        // If no peers are returned, at least include the current witness
        if (peers.length === 0) {
            peers.push({ peer_id: chainData.current_witness });
        }

        // Send response
        res.json({
            "current_block_identifier": {
                "index": chainData.head_block_number,
                "hash": chainData.head_block_id,
            },
            "current_block_timestamp": chainData.time,
            "oldest_block_identifier": {
                "index": 1,
                "hash": genesisBlock.block.block_id,
            },
            "genesis_block_identifier": {
                "index": 1,
                "hash": genesisBlock.block.block_id,
            },
            "peers": peers,
        });
    } catch (error) {
        console.error("Status endpoint error:", error);

        // Check if the error is specifically related to the network_node_api
        if (error.message && error.message.includes('network_node_api')) {
            console.warn("network_node_api may not be enabled on this node. Falling back to current witness only.");

            try {
                const chain = await createHiveChain({
                    apiEndpoint: "http://127.0.0.1:4000",
                    restApiEndpoint: "http://127.0.0.1:4000"
                });
                const [chainData, genesisBlock] = await Promise.all([
                    chain.api.database_api.get_dynamic_global_properties(),
                    chain.api.block_api.get_block({ block_num: 1 })
                ]);

                // Send response with just the current witness as a peer
                return res.json({
                    "current_block_identifier": {
                        "index": chainData.head_block_number,
                        "hash": chainData.head_block_id,
                    },
                    "current_block_timestamp": chainData.time,
                    "oldest_block_identifier": {
                        "index": 1,
                        "hash": genesisBlock.block.block_id,
                    },
                    "genesis_block_identifier": {
                        "index": 1,
                        "hash": genesisBlock.block.block_id,
                    },
                    "peers": [{ "peer_id": chainData.current_witness }],
                });
            } catch (fallbackError) {
                console.error("Fallback error:", fallbackError);
            }
        }

        const isRetriable = error.message && /timeout|connection|network/i.test(error.message);
        return res.status(500).json({
            code: 500,
            message: "Internal error while fetching blockchain status",
            retriable: isRetriable,
            details: process.env.NODE_ENV === 'development' ? { error: error.message } : undefined
        });
    }
});

router.post('/options', async function(req, res) {
    try {
        const chain = await createHiveChain({
            apiEndpoint: "http://127.0.0.1:4000",
            restApiEndpoint: "http://127.0.0.1:4000"
        });
        const expectedNetwork = chain.chainId;

        // Validate network identifier if provided
        if (req.body && req.body.network_identifier) {
            const { blockchain, network } = req.body.network_identifier;

            if (!blockchain || blockchain.toLowerCase() !== "hive") {
                return res.status(400).json({
                    code: 1,
                    message: "Invalid network",
                    description: "Unsupported blockchain: must be 'hive'",
                    retriable: false
                });
            }

            if (network && network !== expectedNetwork) {
                return res.status(400).json({
                    code: 1,
                    message: "Invalid network",
                    description: `Unsupported network: must be '${expectedNetwork}'`,
                    retriable: false
                });
            }
        }

        // Return the network options for Hive blockchain
        res.json({
            "version": {
                "rosetta_version": "1.4.10",
                "node_version": "1.27.8", // TODO: fetch it from node, hardcoded is fine because it's tied to the underlying docker file for now anyways
                "middleware_version": "1.0.0",
                "metadata": {
                    "blockchain": "Hive",
                    "network": expectedNetwork,
                }
            },
            "allow": {
                "operation_statuses": [
                    {
                        "status": "SUCCESS",
                        "successful": true
                    }
                ],
                "operation_types": [
                    // Regular operations (from opsProcessor.ts)
                    "transfer_operation",
                    "claim_reward_balance_operation",
                    "transfer_to_savings_operation",
                    "collateralized_convert_operation",
                    "convert_operation",
                    "limit_order_create_operation",
                    "limit_order_create2_operation",
                    "transfer_to_vesting_operation",
                    "account_create_operation",
                    "account_create_with_delegation_operation",
                    "escrow_transfer_operation",
                    "escrow_release_operation",

                    // Virtual operations (from virtualOpsProcessor.ts)
                    "fill_recurrent_transfer_operation",
                    "fill_transfer_from_savings_operation",
                    "interest_operation",
                    "fill_convert_request_operation",
                    "limit_order_cancelled_operation",
                    "fill_order_operation",
                    "fill_collateralized_convert_request_operation",
                    "collateralized_convert_immediate_conversion_operation",
                    "fill_vesting_withdraw_operation",
                    "liquidity_reward_operation",
                    "escrow_approved_operation",
                    "escrow_rejected_operation",
                    'proposal_fee_operation',
                    'proposal_pay_operation',
                    'hardfork_hive_operation',
                    'hardfork_hive_restore_operation'
                ],
                "errors": [
                    {
                        "code": 0,
                        "message": "Endpoint not supported",
                        "retriable": false
                    },
                    {
                        "code": 1,
                        "message": "Invalid network",
                        "retriable": false
                    },
                    {
                        "code": 2,
                        "message": "Invalid blockchain",
                        "retriable": false
                    },
                    {
                        "code": 3,
                        "message": "Invalid version",
                        "retriable": false
                    },
                    {
                        "code": 4,
                        "message": "Invalid account format",
                        "retriable": false
                    },
                    {
                        "code": 5,
                        "message": "Invalid block hash",
                        "retriable": false
                    },
                    {
                        "code": 6,
                        "message": "Invalid block index",
                        "retriable": false
                    },
                    {
                        "code": 7,
                        "message": "Invalid public key",
                        "retriable": false
                    },
                    {
                        "code": 8,
                        "message": "Invalid transaction hash",
                        "retriable": false
                    },
                    {
                        "code": 9,
                        "message": "Invalid operation",
                        "retriable": false
                    },
                    {
                        "code": 10,
                        "message": "Transaction rejected by network",
                        "retriable": true
                    },
                    {
                        "code": 11,
                        "message": "Block not found",
                        "retriable": true
                    },
                    {
                        "code": 12,
                        "message": "Internal error",
                        "retriable": true
                    }
                ],
                "historical_balance_lookup": false,
                "call_methods": [],
                "balance_exemptions": [],
                "mempool_coins": false
            }
        });
    } catch (error) {
        console.error("Error processing options request:", error);
        res.status(500).json({
            code: 12,
            message: "Internal error",
            description: "An unexpected error occurred while processing the request.",
            retriable: true,
            details: error.message
        });
    }
});

module.exports = router;

