import express from 'express';
import bodyParser from 'body-parser';
const urlencodedParser = bodyParser.urlencoded({extended: false});

const router = express.Router();

// https://docs.cdp.coinbase.com/mesh/reference/mempool
router.post('/', urlencodedParser, async function(req,res) {
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

// https://docs.cdp.coinbase.com/mesh/reference/mempooltransaction
router.post('/transaction', urlencodedParser, async function(req,res) {
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

export default router;