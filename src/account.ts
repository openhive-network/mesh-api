import express from 'express';
import {createHiveChain} from "@hiveio/wax";
import bodyParser from 'body-parser';
const urlencodedParser = bodyParser.urlencoded({extended: false});

const router = express.Router();

// AccountBalance: https://docs.cdp.coinbase.com/mesh/reference/accountbalance
router.post('/balance', urlencodedParser, async function(req, res) {
    const blockchain = req.body.network_identifier.blockchain;
    const network = req.body.network_identifier.network;
    const account = req.body.account_identifier.address;
    const currencies = req.body.currencies || [];

    // Validate currencies if provided
    if (currencies.length > 0) {
        for (const currency of currencies) {
            if (!['HIVE', 'HBD'].includes(currency.symbol)) {
                return res.status(500).json({
                    code: 12,
                    message: "Invalid currency symbol",
                    description: "Only HIVE and HBD symbols are supported.",
                    retriable: false,
                    details: { symbol: currency.symbol }
                });
            }
        }
    }

    try {
        const chain = await createHiveChain({
            apiEndpoint: "http://127.0.0.1:4000",
            restApiEndpoint: "http://127.0.0.1:4000"
        });
        const chainData = await chain.api.database_api.get_dynamic_global_properties();
        const accountData = await chain.api.database_api.find_accounts({accounts: [account]});

        if (!accountData.accounts || accountData.accounts.length === 0) {
            return res.status(500).json({
                code: 12,
                message: "Account not found",
                description: "The requested account does not exist.",
                retriable: false,
                details: { account }
            });
        }

        const acc = accountData.accounts[0];

        // Prepare balances based on requested currencies
        let balances = [];

        if (currencies.length === 0 || currencies.some(c => c.symbol === 'HBD')) {
            balances.push({
                value: acc.hbd_balance.amount,
                currency: {
                    symbol: "HBD",
                    decimals: acc.hbd_balance.precision,
                    metadata: null
                },
                metadata: null
            });
        }

        if (currencies.length === 0 || currencies.some(c => c.symbol === 'HIVE')) {
            balances.push({
                value: acc.balance.amount,
                currency: {
                    symbol: "HIVE",
                    decimals: acc.balance.precision,
                    metadata: null
                },
                metadata: null
            });
        }

        res.json({
            block_identifier: {
                index: chainData.head_block_number,
                hash: chainData.head_block_id
            },
            balances,
            metadata: null
        });

    } catch (error) {
        res.status(500).json({
            code: 12,
            message: "Internal error",
            description: "An unexpected error occurred while processing the request.",
            retriable: true,
            details: null
        });
    }
});

router.post('/coins', urlencodedParser, async function(req,res) {
    res.status(500).send(
        {
            "code": 12,
            "message": "Unsupported query",
            "description": "This blockchain is account based and does not have UXTOs",
            "retriable": false,
            "details": null
        }
    )
});

module.exports = router;

