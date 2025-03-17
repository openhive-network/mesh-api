import express from 'express';
import networkRouter from './network.js';
import accountRouter from './account.js';
import blockRouter from './block.js';
import mempoolRouter from './mempool.js';
import constructionRouter from './construction.js';
let app = express();
app.use(express.json());

app.use('/network', networkRouter);
app.use('/account', accountRouter);
app.use('/block', blockRouter);
app.use('/mempool', mempoolRouter);
app.use('/construction', constructionRouter);

// Handle 404 errors for unsupported endpoints
app.use((req, res) => {
    res.status(404).json({
        code: 0,
        message: "Endpoint not supported",
        description: `The requested endpoint '${req.originalUrl}' is not supported by this API implementation`,
        retriable: false
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    res.status(500).json({
        code: 12,
        message: "Internal error",
        description: "An unexpected error occurred while processing the request",
        retriable: true,
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start the server
const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
    console.log(`Hive Mesh API server running on port ${PORT}`);
});