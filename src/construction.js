import express from 'express';
import {createHiveChain} from "@hiveio/wax";
import bodyParser from 'body-parser';

const urlencodedParser = bodyParser.urlencoded({extended: false});

const router = express.Router();

// https://docs.cdp.coinbase.com/mesh/reference/constructionderive
router.post('/derive', urlencodedParser, async function(req,res) {
    res.status(500).send(
        {
            "code": 12,
            "message": "Unsupported query",
            "description": "This blockchain requires an on-chain action to create an account",
            "retriable": false,
            "details": null
        }
    )
});

// https://docs.cdp.coinbase.com/mesh/reference/constructionpreprocess
router.post('/preprocess', urlencodedParser, async function(req, res) {
    if (!req.body || !req.body.network_identifier || !req.body.operations) {
        return res.status(400).json({
            code: 11,
            message: "Invalid request",
            description: "network_identifier and operations are required",
            retriable: false
        });
    }

    const { network_identifier, operations, metadata } = req.body;

    if (!network_identifier.blockchain || network_identifier.blockchain.toLowerCase() !== 'hive') {
        return res.status(400).json({
            code: 1,
            message: "Invalid network",
            description: "Unsupported blockchain: must be 'hive'",
            retriable: false
        });
    }

    for (let i = 0; i < operations.length; i++) {
        if (operations[i].type !== "transfer_operation") {
            return res.status(400).json({
                code: 9,
                message: "Invalid operation",
                description: "The only supported operation is 'transfer_operation'",
                retriable: false
            });
        }
    }

    try {
        // Verify chain ID if network is specified
        if (network_identifier.network) {
            const chain = await createHiveChain({
                apiEndpoint: "http://127.0.0.1:4000",
                restApiEndpoint: "http://127.0.0.1:4000"
            });
            const expectedNetwork = chain.chainId;
            if (network_identifier.network !== expectedNetwork) {
                return res.status(400).json({
                    code: 1,
                    message: "Invalid network",
                    description: `Unsupported network: must be '${expectedNetwork}'`,
                    retriable: false
                });
            }
        }

        let accountsSet = new Set();
        for (let i = 0; i < operations.length; i++) {
            const op = operations[i];

            if (!op.account || !op.account.address) {
                return res.status(400).json({
                    code: 9,
                    message: "Invalid operation",
                    description: "Each operation must include an account with an address",
                    retriable: false
                });
            }

            // Only include sender accounts (negative amounts)
            if (op.amount && parseFloat(op.amount.value) < 0) {
                accountsSet.add(op.account.address);
            }
        }

        const required_public_keys = Array.from(accountsSet).map(address => ({ address }));

        // Prepare options for the next step
        const options = {
            required_public_keys
        };

        // If we have additional metadata, include it
        if (metadata) {
            Object.assign(options, metadata);
        }

        res.json({
            options
        });

    } catch (error) {
        console.error("Error processing request:", error);
        res.status(500).json({
            code: 12,
            message: "Internal error",
            description: "An unexpected error occurred while processing the request",
            retriable: true,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});


// https://docs.cdp.coinbase.com/mesh/reference/constructionmetadata
router.post('/metadata', urlencodedParser, async function(req, res) {
    if (!req.body || !req.body.network_identifier || !req.body.options) {
        return res.status(400).json({
            code: 11,
            message: "Invalid request",
            description: "network_identifier and options are required",
            retriable: false
        });
    }

    const { network_identifier, options } = req.body;
    if (!network_identifier.blockchain || network_identifier.blockchain.toLowerCase() !== 'hive') {
        return res.status(400).json({
            code: 1,
            message: "Invalid network",
            description: "Unsupported blockchain: must be 'hive'",
            retriable: false
        });
    }

    try {
        const chain = await createHiveChain({
            apiEndpoint: "http://127.0.0.1:4000",
            restApiEndpoint: "http://127.0.0.1:4000"
        });

        // Verify chain ID if network is specified
        if (network_identifier.network) {
            const expectedNetwork = chain.chainId;
            if (network_identifier.network !== expectedNetwork) {
                return res.status(400).json({
                    code: 1,
                    message: "Invalid network",
                    description: `Unsupported network: must be '${expectedNetwork}'`,
                    retriable: false
                });
            }
        }

        // Get current blockchain state
        const chainData = await chain.api.database_api.get_dynamic_global_properties();

        // Get account public keys for each required account
        const requiredAccounts = options.required_public_keys || [];
        const accountAddresses = requiredAccounts.map(acc => acc.address);

        let publicKeysMap = {};

        if (accountAddresses.length > 0) {
            const accountsData = await chain.api.database_api.find_accounts({
                accounts: accountAddresses
            });

            if (accountsData.accounts && accountsData.accounts.length > 0) {
                for (const account of accountsData.accounts) {
                    // Get active authorities (for transaction signing)
                    const activeKeys = account.active.key_auths.map(keyAuth => keyAuth[0]);
                    publicKeysMap[account.name] = {
                        active_keys: activeKeys
                    };
                }
            }
        }

        const metadata = {
            recent_block_hash: chainData.head_block_id,
            reference_block_num: chainData.head_block_number,
            // Convert hex string to buffer and read as little-endian 32-bit integer at position 4
            reference_block_prefix: Buffer.from(chainData.head_block_id, 'hex').readUInt32LE(4),
            account_keys: publicKeysMap
        };

        res.json({
            metadata
        });
    } catch (error) {
        console.error("Error processing metadata request:", error);
        res.status(500).json({
            code: 12,
            message: "Internal error",
            description: "An unexpected error occurred while processing the request",
            retriable: true,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

router.post('/payloads', urlencodedParser, async function(req, res) {
    if (!req.body || !req.body.network_identifier || !req.body.operations || !req.body.metadata) {
        return res.status(400).json({
            code: 11,
            message: "Invalid request",
            description: "network_identifier, operations, and metadata are required",
            retriable: false
        });
    }

    const { network_identifier, operations, metadata } = req.body;

    if (!network_identifier.blockchain || network_identifier.blockchain.toLowerCase() !== 'hive') {
        return res.status(400).json({
            code: 1,
            message: "Invalid network",
            description: "Unsupported blockchain: must be 'hive'",
            retriable: false
        });
    }

    try {
        const chain = await createHiveChain({
            apiEndpoint: "http://127.0.0.1:4000",
            restApiEndpoint: "http://127.0.0.1:4000"
        });

        if (network_identifier.network) {
            const expectedNetwork = chain.chainId;
            if (network_identifier.network !== expectedNetwork) {
                return res.status(400).json({
                    code: 1,
                    message: "Invalid network",
                    description: `Unsupported network: must be '${expectedNetwork}'`,
                    retriable: false
                });
            }
        }

        // Parse operations to build the Hive transaction
        const transaction = {
            ref_block_num: metadata.reference_block_num & 0xFFFF, // Lower 16 bits only
            ref_block_prefix: metadata.reference_block_prefix,
            expiration: new Date(Date.now() + 600 * 1000).toISOString().split('.')[0],
            operations: [],
            extensions: []
        };

        // Group operations by type and create Hive operations structure
        let transfers = [];
        let senders = new Set();

        // First pass to identify senders and recipients
        for (const op of operations) {
            if (op.type !== 'transfer_operation') {
                return res.status(400).json({
                    code: 9,
                    message: "Invalid operation",
                    description: "Only transfer_operation is supported",
                    retriable: false
                });
            }

            if (!op.account || !op.account.address) {
                return res.status(400).json({
                    code: 9,
                    message: "Invalid operation",
                    description: "Each operation must include an account with an address",
                    retriable: false
                });
            }

            if (!op.amount || !op.amount.value || !op.amount.currency) {
                return res.status(400).json({
                    code: 9,
                    message: "Invalid operation",
                    description: "Each operation must include an amount with value and currency",
                    retriable: false
                });
            }

            // Track sender accounts (those with negative amounts)
            if (parseFloat(op.amount.value) < 0) {
                senders.add(op.account.address);
            }
        }

        // Second pass to build transfers
        for (let i = 0; i < operations.length; i += 2) {
            // For Hive transactions, we expect operations in pairs: sender and recipient
            if (i + 1 >= operations.length) {
                return res.status(400).json({
                    code: 9,
                    message: "Invalid operations",
                    description: "Transfer operations must be in sender/recipient pairs",
                    retriable: false
                });
            }

            const sendOp = operations[i];
            const receiveOp = operations[i + 1];

            // Verify pair consistency
            if (parseFloat(sendOp.amount.value) >= 0 || parseFloat(receiveOp.amount.value) <= 0) {
                return res.status(400).json({
                    code: 9,
                    message: "Invalid operations",
                    description: "Transfer pairs must have sender (negative amount) and recipient (positive amount)",
                    retriable: false
                });
            }

            if (Math.abs(parseFloat(sendOp.amount.value)) !== parseFloat(receiveOp.amount.value)) {
                return res.status(400).json({
                    code: 9,
                    message: "Invalid operations",
                    description: "Transfer amount mismatch between sender and recipient",
                    retriable: false
                });
            }

            // Use the new amount format
            // Extract the numeric value and convert to string
            const amountValue = parseFloat(receiveOp.amount.value).toFixed(3);

            // Determine NAI based on currency symbol
            let nai = "@@000000021"; // Default for HIVE
            if (receiveOp.amount.currency && receiveOp.amount.currency.symbol) {
                const symbol = receiveOp.amount.currency.symbol.toUpperCase();
                if (symbol === "HBD") {
                    nai = "@@000000013"; // NAI for HBD
                }
            }

            let memo = '';

            // Extract memo from metadata or operation metadata if available
            if (receiveOp.metadata && receiveOp.metadata.memo) {
                memo = receiveOp.metadata.memo;
            }

            transfers.push({
                from: sendOp.account.address,
                to: receiveOp.account.address,
                amount: {
                    amount: amountValue.replace('.', ''), // Remove decimal point for amount value
                    precision: 3,
                    nai: nai
                },
                memo: memo
            });
        }

        for (const transfer of transfers) {
            transaction.operations.push(
                {
                    "type": "transfer_operation",
                    "value":
                        {
                            from: transfer.from,
                            to: transfer.to,
                            amount: transfer.amount,
                            memo: transfer.memo
                        }
                }
            );
        }

        const serializedTx = JSON.stringify(transaction);
        const payloads = [];
        const accountKeys = metadata.account_keys || {};

        for (const sender of senders) {
            if (!accountKeys[sender] || !accountKeys[sender].active_keys || accountKeys[sender].active_keys.length === 0) {
                return res.status(400).json({
                    code: 9,
                    message: "Missing account keys",
                    description: `No active keys found for account ${sender}`,
                    retriable: false
                });
            }

            // The bytes to sign would typically be a digest of the transaction
            // For Mesh API compatibility, we're including the serialized transaction itself
            // In a real implementation, you would use the chain.signDigest method
            payloads.push({
                account_identifier: {
                    address: sender
                },
                hex_bytes: Buffer.from(serializedTx).toString('hex'),
                signature_type: "ecdsa"
            });
        }

        res.json({
            unsigned_transaction: Buffer.from(serializedTx).toString('hex'),
            payloads: payloads
        });

    } catch (error) {
        console.error("Error processing payloads request:", error);
        res.status(500).json({
            code: 12,
            message: "Internal error",
            description: "An unexpected error occurred while processing the request",
            retriable: true,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// https://docs.cdp.coinbase.com/mesh/reference/constructionparse
router.post('/parse', urlencodedParser, async function(req, res) {
    if (!req.body || !req.body.network_identifier || !req.body.transaction) {
        return res.status(400).json({
            code: 11,
            message: "Invalid request",
            description: "network_identifier and transaction are required",
            retriable: false
        });
    }

    const { network_identifier, transaction, signed } = req.body;
    const isSignedTx = signed === true;

    if (!network_identifier.blockchain || network_identifier.blockchain.toLowerCase() !== 'hive') {
        return res.status(400).json({
            code: 1,
            message: "Invalid network",
            description: "Unsupported blockchain: must be 'hive'",
            retriable: false
        });
    }

    try {
        const chain = await createHiveChain({
            apiEndpoint: "http://127.0.0.1:4000",
            restApiEndpoint: "http://127.0.0.1:4000"
        });

        if (network_identifier.network) {
            const expectedNetwork = chain.chainId;
            if (network_identifier.network !== expectedNetwork) {
                return res.status(400).json({
                    code: 1,
                    message: "Invalid network",
                    description: `Unsupported network: must be '${expectedNetwork}'`,
                    retriable: false
                });
            }
        }

        let txObject;
        try {
            const txBuffer = Buffer.from(transaction, 'hex');
            const txJson = txBuffer.toString('utf8');
            txObject = JSON.parse(txJson);
        } catch (error) {
            return res.status(400).json({
                code: 9,
                message: "Invalid transaction format",
                description: "Could not parse transaction hex data",
                retriable: false
            });
        }

        if (isSignedTx && !txObject.signatures) {
            return res.status(400).json({
                code: 9,
                message: "Invalid signed transaction",
                description: "Transaction marked as signed but contains no signatures",
                retriable: false
            });
        }

        if (!txObject || !txObject.operations || !Array.isArray(txObject.operations)) {
            return res.status(400).json({
                code: 9,
                message: "Invalid transaction",
                description: "Transaction must contain operations array",
                retriable: false
            });
        }

        const operations = [];
        const accountIdentifierSigners = [];

        for (let i = 0; i < txObject.operations.length; i++) {
            const op = txObject.operations[i];

            if (!op.type || !op.value) {
                return res.status(400).json({
                    code: 9,
                    message: "Invalid operation format",
                    description: "Each operation must have type and value fields",
                    retriable: false
                });
            }

            const opType = op.type;
            const opData = op.value;

            // Currently only supporting transfer operations
            if (opType !== 'transfer_operation') {
                return res.status(400).json({
                    code: 9,
                    message: "Unsupported operation",
                    description: "Only 'transfer_operation' is supported",
                    retriable: false
                });
            }

            // Validate transfer operation data
            if (!opData.from || !opData.to || !opData.amount) {
                return res.status(400).json({
                    code: 9,
                    message: "Invalid transfer operation",
                    description: "Transfer must include from, to, and amount fields",
                    retriable: false
                });
            }

            // Get amount value
            let value, currency;
            if (typeof opData.amount === 'object' && opData.amount.amount && opData.amount.nai) {
                value = opData.amount.amount;
                switch (opData.amount.nai) {
                    case '@@000000021':
                        currency = 'HIVE';
                        break;
                    case '@@000000013':
                        currency = 'HBD';
                        break;
                    default:
                        currency = 'UNKNOWN';
                }
            } else if (typeof opData.amount === 'string') {
                // Handle string amount format (e.g. "5.000 HBD")
                const parts = opData.amount.split(' ');
                if (parts.length !== 2) {
                    return res.status(400).json({
                        code: 9,
                        message: "Invalid amount format",
                        description: "String amount must be in format 'value SYMBOL'",
                        retriable: false
                    });
                }
                value = parts[0];
                currency = parts[1];
            } else {
                return res.status(400).json({
                    code: 9,
                    message: "Invalid amount format",
                    description: "Amount must be either an object with amount and nai, or a string",
                    retriable: false
                });
            }

            // Add sender operation (negative amount)
            operations.push({
                operation_identifier: {
                    index: operations.length
                },
                type: "transfer_operation",
                account: {
                    address: opData.from
                },
                amount: {
                    value: `-${value}`,
                    currency: {
                        symbol: currency,
                        decimals: 3
                    }
                }
            });

            // If transaction is signed, add the signer
            if (isSignedTx && !accountIdentifierSigners.some(signer => signer.address === opData.from)) {
                accountIdentifierSigners.push({
                    address: opData.from
                });
            }

            // Add recipient operation (positive amount)
            operations.push({
                operation_identifier: {
                    index: operations.length
                },
                type: "transfer_operation",
                account: {
                    address: opData.to
                },
                amount: {
                    value: value,
                    currency: {
                        symbol: currency,
                        decimals: 3
                    }
                }
            });

            if (opData.memo) {
                operations[operations.length - 1].metadata = {
                    memo: opData.memo
                };
            }
        }

        // Prepare response based on whether the transaction is signed
        if (isSignedTx) {
            return res.json({
                operations,
                account_identifier_signers: accountIdentifierSigners
            });
        } else {
            return res.json({
                operations,
                account_identifier_signers: []
            });
        }

    } catch (error) {
        console.error("Error processing parse request:", error);
        res.status(500).json({
            code: 12,
            message: "Internal error",
            description: "An unexpected error occurred while processing the request",
            retriable: true,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// https://docs.cdp.coinbase.com/mesh/reference/constructioncombine
router.post('/combine', urlencodedParser, async function(req, res) {
    if (!req.body || !req.body.network_identifier || !req.body.unsigned_transaction || !req.body.signatures) {
        return res.status(400).json({
            code: 11,
            message: "Invalid request",
            description: "network_identifier, unsigned_transaction, and signatures are required",
            retriable: false
        });
    }

    const { network_identifier, unsigned_transaction, signatures } = req.body;

    if (!network_identifier.blockchain || network_identifier.blockchain.toLowerCase() !== 'hive') {
        return res.status(400).json({
            code: 1,
            message: "Invalid network",
            description: "Unsupported blockchain: must be 'hive'",
            retriable: false
        });
    }

    try {
        const chain = await createHiveChain({
            apiEndpoint: "http://127.0.0.1:4000",
            restApiEndpoint: "http://127.0.0.1:4000"
        });

        if (network_identifier.network) {
            const expectedNetwork = chain.chainId;
            if (network_identifier.network !== expectedNetwork) {
                return res.status(400).json({
                    code: 1,
                    message: "Invalid network",
                    description: `Unsupported network: must be '${expectedNetwork}'`,
                    retriable: false
                });
            }
        }

        // Parse the unsigned transaction
        let txObject;
        try {
            const txBuffer = Buffer.from(unsigned_transaction, 'hex');
            const txJson = txBuffer.toString('utf8');
            txObject = JSON.parse(txJson);
        } catch (error) {
            return res.status(400).json({
                code: 9,
                message: "Invalid transaction format",
                description: "Could not parse transaction hex data",
                retriable: false
            });
        }

        // Validate signatures array
        if (!Array.isArray(signatures) || signatures.length === 0) {
            return res.status(400).json({
                code: 9,
                message: "Invalid signatures",
                description: "At least one signature is required",
                retriable: false
            });
        }

        // Extract signatures from the request
        const signatureValues = [];
        for (const sig of signatures) {
            if (!sig.hex_bytes) {
                return res.status(400).json({
                    code: 9,
                    message: "Invalid signature format",
                    description: "Each signature must include hex_bytes",
                    retriable: false
                });
            }
            signatureValues.push(sig.hex_bytes);
        }

        // Add signatures to the transaction
        const signedTx = {
            ...txObject,
            signatures: signatureValues
        };

        // Convert signed transaction to hex
        const signedTxHex = Buffer.from(JSON.stringify(signedTx)).toString('hex');

        res.json({
            signed_transaction: signedTxHex
        });

    } catch (error) {
        console.error("Error processing combine request:", error);
        res.status(500).json({
            code: 12,
            message: "Internal error",
            description: "An unexpected error occurred while processing the request",
            retriable: true,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// https://docs.cdp.coinbase.com/mesh/reference/constructionhash
router.post('/hash', urlencodedParser, async function(req, res) {
    if (!req.body || !req.body.network_identifier || !req.body.signed_transaction) {
        return res.status(400).json({
            code: 11,
            message: "Invalid request",
            description: "network_identifier and signed_transaction are required",
            retriable: false
        });
    }

    const { network_identifier, signed_transaction } = req.body;

    if (!network_identifier.blockchain || network_identifier.blockchain.toLowerCase() !== 'hive') {
        return res.status(400).json({
            code: 1,
            message: "Invalid network",
            description: "Unsupported blockchain: must be 'hive'",
            retriable: false
        });
    }

    try {
        const chain = await createHiveChain({
            apiEndpoint: "http://127.0.0.1:4000",
            restApiEndpoint: "http://127.0.0.1:4000"
        });

        if (network_identifier.network) {
            const expectedNetwork = chain.chainId;
            if (network_identifier.network !== expectedNetwork) {
                return res.status(400).json({
                    code: 1,
                    message: "Invalid network",
                    description: `Unsupported network: must be '${expectedNetwork}'`,
                    retriable: false
                });
            }
        }

        const txBuffer = Buffer.from(signed_transaction, 'hex');
        const txJson = txBuffer.toString('utf8');
        const txObject = JSON.parse(txJson);
        const transaction = await chain.createTransactionFromJson(txObject);

        res.json({
            transaction_identifier: {
                hash: transaction.id
            }
        });

    } catch (error) {
        console.error("Error processing hash request:", error);
        res.status(500).json({
            code: 12,
            message: "Internal error",
            description: "An unexpected error occurred while processing the request",
            retriable: true,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// https://docs.cdp.coinbase.com/mesh/reference/constructionhash
router.post('/submit', urlencodedParser, async function(req, res) {
    if (!req.body || !req.body.network_identifier || !req.body.signed_transaction) {
        return res.status(400).json({
            code: 11,
            message: "Invalid request",
            description: "network_identifier and signed_transaction are required",
            retriable: false
        });
    }

    const { network_identifier, signed_transaction } = req.body;

    if (!network_identifier.blockchain || network_identifier.blockchain.toLowerCase() !== 'hive') {
        return res.status(400).json({
            code: 1,
            message: "Invalid network",
            description: "Unsupported blockchain: must be 'hive'",
            retriable: false
        });
    }

    try {
        const chain = await createHiveChain({
            apiEndpoint: "http://127.0.0.1:4000",
            restApiEndpoint: "http://127.0.0.1:4000"
        });

        // Verify chain ID if network is specified
        if (network_identifier.network) {
            const expectedNetwork = chain.chainId;
            if (network_identifier.network !== expectedNetwork) {
                return res.status(400).json({
                    code: 1,
                    message: "Invalid network",
                    description: `Unsupported network: must be '${expectedNetwork}'`,
                    retriable: false
                });
            }
        }

        const txBuffer = Buffer.from(signed_transaction, 'hex');
        const txJson = txBuffer.toString('utf8');
        const txObject = JSON.parse(txJson);
        const transaction = await chain.createTransactionFromJson(txObject);

        await chain.broadcast(transaction);

        res.json({
            transaction_identifier: {
                hash: transaction.id
            }
        });

    } catch (error) {
        console.error("Error processing hash request:", error);
        res.status(500).json({
            code: 12,
            message: "Internal error",
            description: "An unexpected error occurred while processing the request",
            retriable: true,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

export default router;
