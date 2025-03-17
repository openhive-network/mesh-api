function processVirtualOperations(virtualOps, startIndex = 0) {
    let virtualTransactionsResult = [];
    let globalOpIndex = startIndex;

    if (!virtualOps || !virtualOps.ops || !Array.isArray(virtualOps.ops)) {
        return virtualTransactionsResult;
    }

    // First identify any fill_order operations that correspond to limit orders
    // and set their indices accordingly
    const limitOrderFillMap = new Map();

    for (let i = 0; i < virtualOps.ops.length; i++) {
        const vop = virtualOps.ops[i];

        // Skip if not a virtual operation
        if (!vop.virtual_op) {
            continue;
        }

        // If this is a fill_order operation with a transaction ID matching a limit order,
        // store it for special processing
        if (vop.op.type === 'fill_order_operation' && vop.trx_id) {
            if (!limitOrderFillMap.has(vop.trx_id)) {
                limitOrderFillMap.set(vop.trx_id, []);
            }
            limitOrderFillMap.get(vop.trx_id).push(vop);
        }
    }

    // Now process all virtual operations
    for (let i = 0; i < virtualOps.ops.length; i++) {
        const vop = virtualOps.ops[i];

        // Skip if not a virtual operation
        if (!vop.virtual_op) {
            continue;
        }

        // Skip unsupported virtual operations
        if (!isVirtualOperationSupported(vop.op.type)) {
            console.log("operation not supported " + vop.op.type);
            continue;
        }

        // Skip fill_order operations as they'll be handled separately
        if (vop.op.type === 'fill_order_operation') {
            continue;
        }

        // Process different types of virtual operations
        switch (vop.op.type) {
            case 'fill_recurrent_transfer_operation':
                globalOpIndex = processFillRecurrentTransferOperation(vop, virtualTransactionsResult, globalOpIndex);
                break;
            case 'fill_transfer_from_savings_operation':
                globalOpIndex = processFillTransferFromSavingsOperation(vop, virtualTransactionsResult, globalOpIndex);
                break;
            case 'interest_operation':
                globalOpIndex = processInterestOperation(vop, virtualTransactionsResult, globalOpIndex);
                break;
            case 'fill_convert_request_operation':
                globalOpIndex = processFillConvertRequestOperation(vop, virtualTransactionsResult, globalOpIndex);
                break;
            case 'limit_order_cancelled_operation':
                globalOpIndex = processLimitOrderCancelledOperation(vop, virtualTransactionsResult, globalOpIndex);
                break;
            case 'fill_collateralized_convert_request_operation':
                globalOpIndex = processFillCollateralizedConvertRequestOperation(vop, virtualTransactionsResult, globalOpIndex);
                break;
            case 'collateralized_convert_immediate_conversion_operation':
                globalOpIndex = processCollateralizedConvertImmediateConversionOperation(vop, virtualTransactionsResult, globalOpIndex);
                break;
            case 'fill_vesting_withdraw_operation':
                globalOpIndex = processFillVestingWithdrawOperation(vop, virtualTransactionsResult, globalOpIndex);
                break;
            case 'liquidity_reward_operation':
                globalOpIndex = processLiquidityRewardOperation(vop, virtualTransactionsResult, globalOpIndex);
                break;
            case 'escrow_rejected_operation':
                globalOpIndex = processEscrowRejectedOperation(vop, virtualTransactionsResult, globalOpIndex);
                break;
            case 'escrow_approved_operation':
                globalOpIndex = processEscrowApprovedOperation(vop, virtualTransactionsResult, globalOpIndex);
                break;
            case 'proposal_fee_operation':
                globalOpIndex = processProposalFeeOperation(vop, virtualTransactionsResult, globalOpIndex);
                break;
            case 'proposal_pay_operation':
                globalOpIndex = processProposalPayOperation(vop, virtualTransactionsResult, globalOpIndex);
                break;
            case 'hardfork_hive_operation':
                globalOpIndex = processHardforkHiveOperation(vop, virtualTransactionsResult, globalOpIndex);
                break;
            case 'hardfork_hive_restore_operation':
                globalOpIndex = processHardforkHiveRestoreOperation(vop, virtualTransactionsResult, globalOpIndex);
                break;
            default:
                // Skip unsupported virtual operations
                console.log("operation not supported "+vop.op.type)
                break;
        }
    }

    // Now process fill_order operations
    for (const [txId, fillOps] of limitOrderFillMap.entries()) {
        if (fillOps.length > 0) {
            for (const vop of fillOps) {
                globalOpIndex = processFillOrderOperation(vop, virtualTransactionsResult, globalOpIndex);
            }
        }
    }

    return virtualTransactionsResult;
}

// Helper function to determine if a virtual operation type is supported
function isVirtualOperationSupported(opType) {
    const supportedVOps = [
        'fill_recurrent_transfer_operation',
        'fill_transfer_from_savings_operation',
        'interest_operation',
        'fill_convert_request_operation',
        'limit_order_cancelled_operation',
        'fill_order_operation',
        'fill_collateralized_convert_request_operation',
        'collateralized_convert_immediate_conversion_operation',
        'fill_vesting_withdraw_operation',
        'liquidity_reward_operation',
        'escrow_approved_operation',
        'escrow_rejected_operation',
        'proposal_fee_operation',
        'proposal_pay_operation',
        'hardfork_hive_operation',
        'hardfork_hive_restore_operation'
    ];

    return supportedVOps.includes(opType);
}

// Process escrow_approved_operation
function processEscrowApprovedOperation(vop, transactionsResult, opIndex) {
    const from = vop.op.value.from;
    const to = vop.op.value.to;
    const agent = vop.op.value.agent;
    const escrow_id = vop.op.value.escrow_id;
    const fee = vop.op.value.fee;
    const trxId = vop.trx_id;

    // Skip if fee is 0, as we only track this vop for the fee
    if (!fee || fee.amount === "0") {
        return opIndex;
    }

    // Determine currency symbol based on NAI
    let feeSymbol = "HIVE";
    if (fee.nai === "@@000000013") {
        feeSymbol = "HBD";
    }

    // Create transaction for agent (receiving fee)
    transactionsResult.push({
        "transaction_identifier": {
            "hash": trxId
        },
        "operations": [
            {
                "operation_identifier": {
                    "index": opIndex
                },
                "type": vop.op.type,
                "status": "success",
                "account": {
                    "address": agent
                },
                "amount": {
                    "value": fee.amount,
                    "currency": {
                        "symbol": feeSymbol,
                        "decimals": fee.precision
                    }
                },
                "metadata": {
                    "from": from,
                    "to": to,
                    "escrow_id": escrow_id
                }
            }
        ]
    });

    return opIndex + 1;
}

// Process escrow_rejected_operation
function processEscrowRejectedOperation(vop, transactionsResult, startOpIndex) {
    const from = vop.op.value.from;
    const to = vop.op.value.to;
    const agent = vop.op.value.agent;
    const escrow_id = vop.op.value.escrow_id;
    const hive_amount = vop.op.value.hive_amount;
    const hbd_amount = vop.op.value.hbd_amount;
    const fee = vop.op.value.fee;
    const trxId = vop.trx_id;

    let operations = [];
    let opIndex = startOpIndex;

    // Determine fee currency symbol based on NAI
    let feeSymbol = "HIVE";
    let feeValue = "0";

    if (fee && fee.amount !== "0") {
        feeValue = fee.amount;
        if (fee.nai === "@@000000013") {
            feeSymbol = "HBD";
        }
    }

    // Process HIVE amount (if not zero) - include fee if it's HIVE
    if (hive_amount && hive_amount.amount !== "0") {
        let hiveValue = hive_amount.amount;

        // Add fee to HIVE amount if fee is in HIVE
        if (feeSymbol === "HIVE" && feeValue !== "0") {
            // Convert to numbers, add, then back to string
            const totalValue = (parseFloat(hiveValue) + parseFloat(feeValue)).toString();
            hiveValue = totalValue;
            feeValue = "0"; // Mark fee as processed
        }

        operations.push({
            "operation_identifier": {
                "index": opIndex++
            },
            "type": vop.op.type,
            "status": "success",
            "account": {
                "address": from
            },
            "amount": {
                "value": hiveValue,
                "currency": {
                    "symbol": "HIVE",
                    "decimals": hive_amount.precision
                }
            },
            "metadata": {
                "to": to,
                "agent": agent,
                "escrow_id": escrow_id,
                "includes_fee": feeSymbol === "HIVE" && parseFloat(hiveValue) > parseFloat(hive_amount.amount)
            }
        });
    }

    // Process HBD amount (if not zero) - include fee if it's HBD
    if (hbd_amount && hbd_amount.amount !== "0") {
        let hbdValue = hbd_amount.amount;

        // Add fee to HBD amount if fee is in HBD
        if (feeSymbol === "HBD" && feeValue !== "0") {
            // Convert to numbers, add, then back to string
            const totalValue = (parseFloat(hbdValue) + parseFloat(feeValue)).toString();
            hbdValue = totalValue;
            feeValue = "0"; // Mark fee as processed
        }

        operations.push({
            "operation_identifier": {
                "index": opIndex++
            },
            "type": vop.op.type,
            "status": "success",
            "account": {
                "address": from
            },
            "amount": {
                "value": hbdValue,
                "currency": {
                    "symbol": "HBD",
                    "decimals": hbd_amount.precision
                }
            },
            "metadata": {
                "to": to,
                "agent": agent,
                "escrow_id": escrow_id,
                "includes_fee": feeSymbol === "HBD" && parseFloat(hbdValue) > parseFloat(hbd_amount.amount)
            }
        });
    }

    // Handle case where there's only a fee but no HIVE or HBD amount (shouldn't happen but can't hurt)
    if (feeValue !== "0") {
        operations.push({
            "operation_identifier": {
                "index": opIndex++
            },
            "type": vop.op.type,
            "status": "success",
            "account": {
                "address": from
            },
            "amount": {
                "value": feeValue,
                "currency": {
                    "symbol": feeSymbol,
                    "decimals": fee.precision
                }
            },
            "metadata": {
                "to": to,
                "agent": agent,
                "escrow_id": escrow_id,
                "fee_only": true
            }
        });
    }

    // Only add transaction if there are operations
    if (operations.length > 0) {
        transactionsResult.push({
            "transaction_identifier": {
                "hash": trxId
            },
            "operations": operations
        });
    }

    return opIndex; // Return the next available index
}

// Process liquidity_reward_operation
function processLiquidityRewardOperation(vop, transactionsResult, opIndex) {
    const owner = vop.op.value.owner;
    const payout = vop.op.value.payout;
    const trxId = vop.trx_id;

    transactionsResult.push({
        "transaction_identifier": {
            "hash": trxId
        },
        "operations": [
            {
                "operation_identifier": {
                    "index": opIndex
                },
                "type": vop.op.type,
                "status": "success",
                "account": {
                    "address": owner
                },
                "amount": {
                    "value": payout.amount,
                    "currency": {
                        "symbol": "HIVE",
                        "decimals": payout.precision
                    }
                }
            }
        ]
    });

    return opIndex + 1; // Return the next available index
}

// Process fill_recurrent_transfer_operation
function processFillRecurrentTransferOperation(vop, transactionsResult, startOpIndex) {
    const from = vop.op.value.from;
    const to = vop.op.value.to;
    const amount = vop.op.value.amount;
    const trxId = vop.trx_id;
    const memo = vop.op.value.memo || "";

    // Determine currency symbol based on NAI
    let symbol = "HIVE";
    if (amount.nai === "@@000000013") {
        symbol = "HBD";
    }

    // Create FROM transaction (negative amount)
    transactionsResult.push({
        "transaction_identifier": {
            "hash": trxId
        },
        "operations": [
            {
                "operation_identifier": {
                    "index": startOpIndex
                },
                "related_operations": [
                    {
                        "index": startOpIndex + 1
                    }
                ],
                "type": vop.op.type,
                "status": "success",
                "account": {
                    "address": from
                },
                "amount": {
                    "value": `-${amount.amount}`,
                    "currency": {
                        "symbol": symbol,
                        "decimals": amount.precision
                    }
                },
                "metadata": {
                    "memo": memo,
                    "remaining_executions": vop.op.value.remaining_executions
                }
            }
        ]
    });

    // Create TO transaction (positive amount)
    transactionsResult.push({
        "transaction_identifier": {
            "hash": trxId
        },
        "operations": [
            {
                "operation_identifier": {
                    "index": startOpIndex + 1
                },
                "related_operations": [
                    {
                        "index": startOpIndex
                    }
                ],
                "type": vop.op.type,
                "status": "success",
                "account": {
                    "address": to
                },
                "amount": {
                    "value": amount.amount,
                    "currency": {
                        "symbol": symbol,
                        "decimals": amount.precision
                    }
                },
                "metadata": {
                    "memo": memo,
                    "remaining_executions": vop.op.value.remaining_executions
                }
            }
        ]
    });

    return startOpIndex + 2; // Return the next available index
}

// Process fill_transfer_from_savings_operation
function processFillTransferFromSavingsOperation(vop, transactionsResult, opIndex) {
    const from = vop.op.value.from;
    const to = vop.op.value.to;
    const amount = vop.op.value.amount;
    const trxId = vop.trx_id;
    const memo = vop.op.value.memo || "";
    const requestId = vop.op.value.request_id;

    // Determine currency symbol based on NAI
    let symbol = "HIVE";
    if (amount.nai === "@@000000013") {
        symbol = "HBD";
    }

    transactionsResult.push({
        "transaction_identifier": {
            "hash": trxId
        },
        "operations": [
            {
                "operation_identifier": {
                    "index": opIndex
                },
                "type": vop.op.type,
                "status": "success",
                "account": {
                    "address": to
                },
                "amount": {
                    "value": amount.amount,
                    "currency": {
                        "symbol": symbol,
                        "decimals": amount.precision
                    }
                },
                "metadata": {
                    "memo": memo,
                    "request_id": requestId
                }
            }
        ]
    });

    return opIndex + 1; // Return the next available index
}

// Process interest_operation
function processInterestOperation(vop, transactionsResult, opIndex) {
    const owner = vop.op.value.owner;
    const interest = vop.op.value.interest;
    const is_saved_into_hbd_balance = vop.op.value.is_saved_into_hbd_balance;
    const trxId = vop.trx_id;

    // Skip if interest is in savings as we don't track those
    // The naming from hiveD is a little counterintuitive, false means savings is affected, true means liquid balances are affected
    if (is_saved_into_hbd_balance == false) {
        return opIndex;
    }

    transactionsResult.push({
        "transaction_identifier": {
            "hash": trxId
        },
        "operations": [
            {
                "operation_identifier": {
                    "index": opIndex
                },
                "type": vop.op.type,
                "status": "success",
                "account": {
                    "address": owner
                },
                "amount": {
                    "value": interest.amount,
                    "currency": {
                        "symbol": "HBD",  // Interest is always in HBD
                        "decimals": interest.precision
                    }
                }
            }
        ]
    });

    return opIndex + 1; // Return the next available index
}

// Process fill_convert_request_operation
function processFillConvertRequestOperation(vop, transactionsResult, opIndex) {
    const owner = vop.op.value.owner;
    const amount_in = vop.op.value.amount_in;
    const amount_out = vop.op.value.amount_out;
    const trxId = vop.trx_id;
    const requestId = vop.op.value.requestid;

    const outSymbol = amount_out.nai === "@@000000013" ? "HBD" : "HIVE";

    transactionsResult.push({
        "transaction_identifier": {
            "hash": trxId
        },
        "operations": [
            {
                "operation_identifier": {
                    "index": opIndex
                },
                "type": vop.op.type,
                "status": "success",
                "account": {
                    "address": owner
                },
                "amount": {
                    "value": amount_out.amount,
                    "currency": {
                        "symbol": outSymbol,
                        "decimals": amount_out.precision
                    }
                },
                "metadata": {
                    "request_id": requestId,
                    "amount_in": amount_in,
                }
            }
        ]
    });

    return opIndex + 1; // Return the next available index
}

// Process limit_order_cancelled_operation
function processLimitOrderCancelledOperation(vop, transactionsResult, opIndex) {
    const owner = vop.op.value.seller;
    const amount_back = vop.op.value.amount_back;
    const trxId = vop.trx_id;
    const orderId = vop.op.value.orderid;

    // Skip if amount is 0
    if (!amount_back || amount_back.amount === "0") {
        return opIndex;
    }

    // Determine currency symbol based on NAI
    let symbol = "HIVE";
    if (amount_back.nai === "@@000000013") {
        symbol = "HBD";
    }

    transactionsResult.push({
        "transaction_identifier": {
            "hash": trxId
        },
        "operations": [
            {
                "operation_identifier": {
                    "index": opIndex
                },
                "type": vop.op.type,
                "status": "success",
                "account": {
                    "address": owner
                },
                "amount": {
                    "value": amount_back.amount,
                    "currency": {
                        "symbol": symbol,
                        "decimals": amount_back.precision
                    }
                },
                "metadata": {
                    "order_id": orderId
                }
            }
        ]
    });

    return opIndex + 1; // Return the next available index
}

// Process fill_order_operation
function processFillOrderOperation(vop, transactionsResult, startOpIndex) {
    const current_owner = vop.op.value.current_owner;
    const current_pays = vop.op.value.current_pays;
    const open_owner = vop.op.value.open_owner;
    const open_pays = vop.op.value.open_pays;
    const trxId = vop.trx_id;

    // Skip if both amounts are 0
    if ((!current_pays || current_pays.amount === "0") &&
        (!open_pays || open_pays.amount === "0")) {
        return startOpIndex;
    }

    // Determine currency symbols
    let currentPaySymbol = "HIVE";
    if (current_pays.nai === "@@000000013") {
        currentPaySymbol = "HBD";
    }

    let openPaySymbol = "HIVE";
    if (open_pays.nai === "@@000000013") {
        openPaySymbol = "HBD";
    }

    // Create operation for current owner (sells current_pays, receives open_pays)
    transactionsResult.push({
        "transaction_identifier": {
            "hash": trxId
        },
        "operations": [
            {
                "operation_identifier": {
                    "index": startOpIndex
                },
                "related_operations": [
                    {
                        "index": startOpIndex + 1
                    }
                ],
                "type": `${vop.op.type}`,
                "status": "success",
                "account": {
                    "address": current_owner
                },
                "amount": {
                    "value": open_pays.amount,
                    "currency": {
                        "symbol": openPaySymbol,
                        "decimals": open_pays.precision
                    }
                }
            }
        ]
    });

    // Create operation for open trade owner (sells open_pays, receives current_pays)
    transactionsResult.push({
        "transaction_identifier": {
            "hash": trxId
        },
        "operations": [
            {
                "operation_identifier": {
                    "index": startOpIndex + 1
                },
                "related_operations": [
                    {
                        "index": startOpIndex
                    }
                ],
                "type": `${vop.op.type}`,
                "status": "success",
                "account": {
                    "address": open_owner
                },
                "amount": {
                    "value": current_pays.amount,
                    "currency": {
                        "symbol": currentPaySymbol,
                        "decimals": current_pays.precision
                    }
                }
            }
        ]
    });

    return startOpIndex + 2; // Return the next available index
}

// Process fill_collateralized_convert_request_operation
function processFillCollateralizedConvertRequestOperation(vop, transactionsResult, startOpIndex) {
    const owner = vop.op.value.owner;
    const amount_in = vop.op.value.amount_in;
    const amount_out = vop.op.value.amount_out;
    const amount_collateral = vop.op.value.excess_collateral;
    const trxId = vop.trx_id;
    const requestId = vop.op.value.requestid;

    let currentOpIndex = startOpIndex;

    // Create operation for excess_collateral (HIVE)
    if (amount_collateral && amount_collateral.amount !== "0") {
        transactionsResult.push({
            "transaction_identifier": {
                "hash": trxId
            },
            "operations": [
                {
                    "operation_identifier": {
                        "index": currentOpIndex
                    },
                    "related_operations": [
                        {
                            "index": currentOpIndex + 1
                        }
                    ],
                    "type": vop.op.type,
                    "status": "success",
                    "account": {
                        "address": owner
                    },
                    "amount": {
                        "value": `${amount_collateral.amount}`,
                        "currency": {
                            "symbol": "HIVE",
                            "decimals": amount_collateral.precision
                        }
                    },
                    "metadata": {
                        "request_id": requestId,
                    }
                }
            ]
        });
        currentOpIndex++;
    }

    transactionsResult.push({
        "transaction_identifier": {
            "hash": trxId
        },
        "operations": [
            {
                "operation_identifier": {
                    "index": currentOpIndex
                },
                "related_operations": amount_collateral && amount_collateral.amount !== "0" ? [
                    {
                        "index": currentOpIndex - 1
                    }
                ] : [],
                "type": vop.op.type,
                "status": "success",
                "account": {
                    "address": owner
                },
                "amount": {
                    "value": amount_out.amount,
                    "currency": {
                        "symbol": "HBD",
                        "decimals": amount_out.precision
                    }
                },
                "metadata": {
                    "request_id": requestId,
                }
            }
        ]
    });

    return currentOpIndex + 1; // Return the next available index
}

// Process collateralized_convert_immediate_conversion_operation
function processCollateralizedConvertImmediateConversionOperation(vop, transactionsResult, opIndex) {
    const owner = vop.op.value.owner;
    const amount = vop.op.value.hbd_out;
    const trxId = vop.trx_id;

    transactionsResult.push({
        "transaction_identifier": {
            "hash": trxId
        },
        "operations": [
            {
                "operation_identifier": {
                    "index": opIndex
                },
                "type": vop.op.type,
                "status": "success",
                "account": {
                    "address": owner
                },
                "amount": {
                    "value": amount.amount,
                    "currency": {
                        "symbol": "HBD",
                        "decimals": amount.precision
                    }
                }
            }
        ]
    });

    return opIndex + 1; // Return the next available index
}

// Process fill_vesting_withdraw_operation
function processFillVestingWithdrawOperation(vop, transactionsResult, opIndex) {
    const from_account = vop.op.value.from_account;
    const to_account = vop.op.value.to_account;
    const withdrawn = vop.op.value.withdrawn;
    const deposited = vop.op.value.deposited;
    const trxId = vop.trx_id;

    // Skip if it's a VESTS withdrawal (in the case of a route that has autovests enabled)
    if (deposited.nai != "@@000000021") {
        return opIndex;
    }

    // Create operation for to_account (deposited HIVE/HBD)
    transactionsResult.push({
        "transaction_identifier": {
            "hash": trxId
        },
        "operations": [
            {
                "operation_identifier": {
                    "index": opIndex
                },
                "type": vop.op.type,
                "status": "success",
                "account": {
                    "address": to_account
                },
                "amount": {
                    "value": deposited.amount,
                    "currency": {
                        "symbol": "HIVE",
                        "decimals": deposited.precision
                    }
                },
                "metadata": {
                    "from_account": from_account,
                    "withdrawn": withdrawn,
                }
            }
        ]
    });

    return opIndex + 1; // Return the next available index
}

// Process proposal_fee_operation
function processProposalFeeOperation(vop, transactionsResult, opIndex) {
    const account = vop.op.value.account;
    const fee = vop.op.value.fee;
    const trxId = vop.trx_id;
    const proposal_id = vop.op.value.proposal_id;

    transactionsResult.push({
        "transaction_identifier": {
            "hash": trxId
        },
        "operations": [
            {
                "operation_identifier": {
                    "index": opIndex
                },
                "type": vop.op.type,
                "status": "success",
                "account": {
                    "address": account
                },
                "amount": {
                    "value": `-${fee.amount}`,
                    "currency": {
                        "symbol": "HBD",
                        "decimals": fee.precision
                    }
                },
                "metadata": {
                    "proposal_id": proposal_id
                }
            }
        ]
    });

    return opIndex + 1; // Return the next available index
}

// Process proposal_pay_operation
function processProposalPayOperation(vop, transactionsResult, opIndex) {
    const receiver = vop.op.value.receiver;
    const payment = vop.op.value.payment;
    const trxId = vop.trx_id;
    const proposal_id = vop.op.value.proposal_id;

    transactionsResult.push({
        "transaction_identifier": {
            "hash": trxId
        },
        "operations": [
            {
                "operation_identifier": {
                    "index": opIndex
                },
                "type": vop.op.type,
                "status": "success",
                "account": {
                    "address": receiver
                },
                "amount": {
                    "value": payment.amount,
                    "currency": {
                        "symbol": "HBD",
                        "decimals": payment.precision
                    }
                },
                "metadata": {
                    "proposal_id": proposal_id
                }
            }
        ]
    });

    return opIndex + 1; // Return the next available index
}

// Process hardfork_hive_operation
function processHardforkHiveOperation(vop, transactionsResult, startOpIndex) {
    const account = vop.op.value.account;
    const hive_amount = vop.op.value.hive_amount;
    const hbd_amount = vop.op.value.hbd_amount;
    const trxId = vop.trx_id;

    let operations = [];
    let opIndex = startOpIndex;

    // Process HIVE amount (if not zero)
    if (hive_amount && hive_amount.amount !== "0") {
        operations.push({
            "operation_identifier": {
                "index": opIndex++
            },
            "type": vop.op.type,
            "status": "success",
            "account": {
                "address": account
            },
            "amount": {
                "value": hive_amount.amount,
                "currency": {
                    "symbol": "HIVE",
                    "decimals": hive_amount.precision
                }
            }
        });
    }

    // Process HBD amount (if not zero)
    if (hbd_amount && hbd_amount.amount !== "0") {
        operations.push({
            "operation_identifier": {
                "index": opIndex++
            },
            "type": vop.op.type,
            "status": "success",
            "account": {
                "address": account
            },
            "amount": {
                "value": hbd_amount.amount,
                "currency": {
                    "symbol": "HBD",
                    "decimals": hbd_amount.precision
                }
            }
        });
    }

    // Only add transaction if there are operations
    if (operations.length > 0) {
        transactionsResult.push({
            "transaction_identifier": {
                "hash": trxId
            },
            "operations": operations
        });
    }

    return opIndex; // Return the next available index
}


// Process hardfork_hive_restore_operation
function processHardforkHiveRestoreOperation(vop, transactionsResult, startOpIndex) {
    const account = vop.op.value.account;
    const hive_amount = vop.op.value.hive_amount;
    const hbd_amount = vop.op.value.hbd_amount;
    const trxId = vop.trx_id;

    let operations = [];
    let opIndex = startOpIndex;

    // Process HIVE amount (if not zero)
    if (hive_amount && hive_amount.amount !== "0") {
        operations.push({
            "operation_identifier": {
                "index": opIndex++
            },
            "type": vop.op.type,
            "status": "success",
            "account": {
                "address": account
            },
            "amount": {
                "value": hive_amount.amount,
                "currency": {
                    "symbol": "HIVE",
                    "decimals": hive_amount.precision
                }
            }
        });
    }

    // Process HBD amount (if not zero)
    if (hbd_amount && hbd_amount.amount !== "0") {
        operations.push({
            "operation_identifier": {
                "index": opIndex++
            },
            "type": vop.op.type,
            "status": "success",
            "account": {
                "address": account
            },
            "amount": {
                "value": hbd_amount.amount,
                "currency": {
                    "symbol": "HBD",
                    "decimals": hbd_amount.precision
                }
            }
        });
    }

    // Only add transaction if there are operations
    if (operations.length > 0) {
        transactionsResult.push({
            "transaction_identifier": {
                "hash": trxId
            },
            "operations": operations
        });
    }

    return opIndex; // Return the next available index
}

export {
    processVirtualOperations
};