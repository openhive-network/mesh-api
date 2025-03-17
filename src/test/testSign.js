/**
 * Hive Transaction Signing Script
 *
 * This standalone script signs a Hive transaction using a private key.
 * Based on the current API of @hiveio/wax and @hiveio/beekeeper.
 *
 * Usage: node sign-transaction.js
 */

import { createHiveChain } from '@hiveio/wax';
import beekeeperFactory from '@hiveio/beekeeper';
import fs from 'fs';

// Function to sign a transaction
async function signTransaction(unsignedTransactionHex, privateKeyWif) {
    try {
        console.log("Initializing Hive chain...");
        const chain = await createHiveChain();
        console.log("Chain initialized successfully.");

        console.log("Initializing beekeeper...");
        const beekeeper = await beekeeperFactory();
        console.log("Beekeeper initialized successfully.");

        const txBuffer = Buffer.from(unsignedTransactionHex, 'hex');
        const txJson = txBuffer.toString('utf8');
        const txObject = JSON.parse(txJson);

        console.log("Transaction to sign:");
        console.log(JSON.stringify(txObject, null, 2));

        console.log("Creating transaction object...");
        const transaction = await chain.createTransactionFromJson(txObject);
        transaction.validate();

        const session = beekeeper.createSession("tempsalt");
        const { wallet } = await session.createWallet("tempwallet");

        console.log("Importing private key...");
        const publicKey = await wallet.importKey(privateKeyWif);
        console.log(`Using public key: ${publicKey}`);

        console.log("Signing transaction...");
        await transaction.sign(wallet, publicKey);
        console.log("Transaction signed successfully!");

        const binaryForm = transaction.toBinaryForm();
        const convertedTx = chain.convertTransactionFromBinaryForm(binaryForm);

        // Extract the signature
        const signature = convertedTx.signatures[0];
        console.log(`Generated signature: ${signature}`);

        // Convert signed transaction to hex for Mesh API
        const signedTxHex = Buffer.from(JSON.stringify(convertedTx)).toString('hex');

        // Prepare response object in Mesh format
        const meshResponse = {
            signature: {
                signing_payload: {
                    account_identifier: {
                        address: "howo"
                    },
                    hex_bytes: unsignedTransactionHex,
                    signature_type: "ecdsa"
                },
                public_key: {
                    hex_bytes: publicKey,
                    curve_type: "secp256k1"
                },
                signature_type: "ecdsa",
                hex_bytes: signature
            },
            signed_transaction: signedTxHex
        };

        fs.writeFileSync('signed_transaction_result.json', JSON.stringify(meshResponse, null, 2));
        console.log("Results saved to signed_transaction_result.json");

        return meshResponse;
    } catch (error) {
        console.error("Error signing transaction:", error);
        throw error;
    }
}

async function main() {
    try {
        // Transaction from Mesh /payloads endpoint
        const unsignedTransactionHex = "7b227265665f626c6f636b5f6e756d223a31373335392c227265665f626c6f636b5f707265666978223a313438383134363337392c2265787069726174696f6e223a22323032352d30332d31305430343a35343a3331222c226f7065726174696f6e73223a5b7b2274797065223a227472616e736665725f6f7065726174696f6e222c2276616c7565223a7b2266726f6d223a22686f776f222c22746f223a22686f776f222c22616d6f756e74223a7b22616d6f756e74223a2231303030222c22707265636973696f6e223a332c226e6169223a224040303030303030303133227d2c226d656d6f223a22227d7d5d2c22657874656e73696f6e73223a5b5d7d";

        // Test private key - REPLACE THIS WITH YOUR TEST KEY
        // WARNING: Never use real private keys in test scripts
        const privateKey = "";

        console.log("Starting transaction signing process...");
        const result = await signTransaction(unsignedTransactionHex, privateKey);

        console.log("Transaction signing completed successfully!");
        console.log("\nTo use with Mesh /combine endpoint:");
        console.log(JSON.stringify({
            network_identifier: {
                blockchain: "hive",
                network: "beeab0de00000000000000000000000000000000000000000000000000000000"
            },
            unsigned_transaction: unsignedTransactionHex,
            signatures: [result.signature]
        }, null, 2));

        console.log("\nTo use with Mesh /parse endpoint (signed transaction):");
        console.log(JSON.stringify({
            network_identifier: {
                blockchain: "hive",
                network: "beeab0de00000000000000000000000000000000000000000000000000000000"
            },
            transaction: result.signed_transaction,
            signed: true
        }, null, 2));

    } catch (error) {
        console.error("Script execution failed:", error);
        process.exit(1);
    }
}

main();