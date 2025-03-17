import express from 'express';
import {createHiveChain} from "@hiveio/wax";
import bodyParser from 'body-parser';
const urlencodedParser = bodyParser.urlencoded({extended: false});

import { processOperations, isOperationSupported } from './opsProcessor.js';
import { processVirtualOperations } from './virtualOpsProcessor.js';

const router = express.Router();

function transactionsProcessor(block) {
    let transactionsResult = [];
    let globalOpIndex = 0;

    for (let i = 0; i < block.transactions.length; i++) {
        const transaction = block.transactions[i];
        const txId = block.transaction_ids[i];

        for (let k = 0; k < transaction.operations.length; k++) {
            const op = transaction.operations[k];

            if (!isOperationSupported(op.type)) {
                console.log("operation not supported " + op.type);
                continue;
            }

            const operationResult = processOperations(op, txId, globalOpIndex, transactionsResult);
            globalOpIndex = operationResult.nextIndex;
        }
    }

    return { transactionsResult, nextIndex: globalOpIndex };
}

function extractBlockNumberFromHash(hash) {
    if (!hash || typeof hash !== 'string' || hash.length < 8) {
        return null;
    }

    try {
        // Take the first 8 characters of the hash and convert from hex to decimal
        return parseInt(hash.substring(0, 8), 16);
    } catch (error) {
        return null;
    }
}

function validateBlockIdentifier(blockIdentifier) {
    if (!blockIdentifier) {
        return { valid: false, message: "Block identifier is required" };
    }

    if (blockIdentifier.index !== undefined) {
        const blockIndex = parseInt(blockIdentifier.index);
        if (isNaN(blockIndex) || blockIndex < 0) {
            return { valid: false, message: "Invalid block index" };
        }
        return { valid: true, blockNum: blockIndex };
    }

    if (blockIdentifier.hash) {
        const blockNum = extractBlockNumberFromHash(blockIdentifier.hash);
        if (!blockNum) {
            return { valid: false, message: "Invalid block hash format" };
        }
        return { valid: true, blockNum: blockNum };
    }

    return { valid: false, message: "Either block index or hash must be provided" };
}

// getBlock: https://docs.cdp.coinbase.com/mesh/reference/block
router.post('/', urlencodedParser, async function(req, res) {
    if (!req.body || !req.body.block_identifier) {
        return res.status(400).json({
            code: 11,
            message: "Invalid request",
            description: "block_identifier is required",
            retriable: false
        });
    }

    const validation = validateBlockIdentifier(req.body.block_identifier);

    if (!validation.valid) {
        return res.status(400).json({
            code: 11,
            message: "Invalid request",
            description: validation.message,
            retriable: false
        });
    }

    const blockIndex = validation.blockNum;

    try {
        const chain = await createHiveChain({
            apiEndpoint: "http://127.0.0.1:4000",
            restApiEndpoint: "http://127.0.0.1:4000"
        });

        let blockResponse = await chain.api.block_api.get_block({ block_num: blockIndex });
        if (!blockResponse || !blockResponse.block) {
            return res.status(404).json({
                code: 12,
                message: "Block not found",
                description: `Block with index ${blockIndex} not found`,
                retriable: false
            });
        }

        const virtualOpsResponse = await chain.api.account_history_api.get_ops_in_block({
            block_num: blockIndex,
            only_virtual: true
        });

        const block = blockResponse.block;

        const { transactionsResult, nextIndex } = transactionsProcessor(block);
        const virtualTransactionsResult = processVirtualOperations(virtualOpsResponse, nextIndex);
        const allTransactions = [...transactionsResult, ...virtualTransactionsResult];

        res.json({
            "block": {
                "block_identifier": {
                    "index": blockIndex,
                    "hash": block.block_id
                },
                "parent_block_identifier": {
                    "index": blockIndex - 1,
                    "hash": block.previous
                },
                "timestamp": new Date(block.timestamp).getTime(),
                "transactions": allTransactions
            }
        });

    } catch (error) {
        console.error("Error processing block request:", error);
        res.status(500).json({
            code: 12,
            message: "Internal error",
            description: "An unexpected error occurred while processing the request.",
            retriable: true,
            details: error.message
        });
    }
});

// BlockTransaction: https://docs.cdp.coinbase.com/mesh/reference/blocktransaction
router.post('/transaction', urlencodedParser, async function(req, res) {
    if (!req.body || !req.body.block_identifier || !req.body.transaction_identifier) {
        return res.status(400).json({
            code: 11,
            message: "Invalid request",
            description: "block_identifier and transaction_identifier are required",
            retriable: false
        });
    }

    if (!req.body.transaction_identifier.hash) {
        return res.status(400).json({
            code: 11,
            message: "Invalid request",
            description: "transaction_identifier.hash is required",
            retriable: false
        });
    }

    const validation = validateBlockIdentifier(req.body.block_identifier);

    if (!validation.valid) {
        return res.status(400).json({
            code: 11,
            message: "Invalid request",
            description: validation.message,
            retriable: false
        });
    }

    const blockIndex = validation.blockNum;
    const transactionId = req.body.transaction_identifier.hash;

    try {
        const chain = await createHiveChain({
            apiEndpoint: "http://127.0.0.1:4000",
            restApiEndpoint: "http://127.0.0.1:4000"
        });
        let blockResponse = await chain.api.block_api.get_block({ block_num: blockIndex });

        if (!blockResponse || !blockResponse.block) {
            return res.status(404).json({
                code: 12,
                message: "Block not found",
                description: `Block with index ${blockIndex} not found`,
                retriable: false
            });
        }

        const block = blockResponse.block;

        const { transactionsResult } = transactionsProcessor(block);
        const virtualOpsResponse = await chain.api.account_history_api.get_ops_in_block({
            block_num: blockIndex,
            only_virtual: true
        });

        const virtualTransactions = processVirtualOperations(virtualOpsResponse, transactionsResult.reduce((count, tx) => count + tx.operations.length, 0));
        const allTransactions = [...transactionsResult, ...virtualTransactions];
        const matchingTransactions = allTransactions.filter(tx =>
            tx.transaction_identifier.hash === transactionId
        );

        if (matchingTransactions.length === 0) {
            return res.status(404).json({
                code: 12,
                message: "Transaction not found",
                description: "Transaction hash not found in block",
                retriable: false
            });
        }

        let allOperations = [];
        matchingTransactions.forEach(tx => {
            allOperations = allOperations.concat(tx.operations);
        });

        return res.json({
            "transaction": {
                "transaction_identifier": {
                    "hash": transactionId
                },
                "operations": allOperations
            }
        });

    } catch (error) {
        console.error("Error processing transaction request:", error);
        res.status(500).json({
            code: 12,
            message: "Internal error",
            description: "An unexpected error occurred while processing the request.",
            retriable: true,
            details: error.message
        });
    }
});

export default router;