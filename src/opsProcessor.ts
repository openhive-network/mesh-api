// Process regular operations
function processOperations(op, txId, globalOpIndex, transactionsResult) {
    let nextIndex = globalOpIndex;

    switch (op.type) {
        case 'transfer_operation':
            nextIndex = processTransferOperation(op, txId, globalOpIndex, transactionsResult);
            break;
        case 'claim_reward_balance_operation':
            nextIndex = processClaimRewardBalanceOperation(op, txId, globalOpIndex, transactionsResult);
            break;
        case 'transfer_to_savings_operation':
            nextIndex = processTransferToSavingsOperation(op, txId, globalOpIndex, transactionsResult);
            break;
        case 'collateralized_convert_operation':
            nextIndex = processCollateralizedConvertOperation(op, txId, globalOpIndex, transactionsResult);
            break;
        case 'convert_operation':
            nextIndex = processConvertOperation(op, txId, globalOpIndex, transactionsResult);
            break;
        case 'limit_order_create_operation':
            nextIndex = processLimitOrderCreateOperation(op, txId, globalOpIndex, transactionsResult);
            break;
        case 'limit_order_create2_operation':
            nextIndex = processLimitOrderCreate2Operation(op, txId, globalOpIndex, transactionsResult);
            break;
        case 'transfer_to_vesting_operation':
            nextIndex = processTransferToVestingOperation(op, txId, globalOpIndex, transactionsResult);
            break;
        case 'account_create_operation':
            nextIndex = processAccountCreateOperation(op, txId, globalOpIndex, transactionsResult);
            break;
        case 'account_create_with_delegation_operation':
            nextIndex = processAccountCreateWithDelegationOperation(op, txId, globalOpIndex, transactionsResult);
            break;
        case 'escrow_transfer_operation':
            nextIndex = processEscrowTransferOperation(op, txId, globalOpIndex, transactionsResult);
            break;
        case 'escrow_release_operation':
            nextIndex = processEscrowReleaseOperation(op, txId, globalOpIndex, transactionsResult);
            break;
        default:
            // Operation type not supported
            break;
    }

    return { nextIndex };
}

// Helper function to determine if an operation type is supported
function isOperationSupported(opType) {
    const supportedOps = [
        'transfer_operation',
        'claim_reward_balance_operation',
        'transfer_to_savings_operation',
        'collateralized_convert_operation',
        'convert_operation',
        'limit_order_create_operation',
        'limit_order_create2_operation',
        'transfer_to_vesting_operation',
        'account_create_operation',
        'account_create_with_delegation_operation',
        'escrow_transfer_operation',
        'escrow_release_operation'
    ];

    return supportedOps.includes(opType);
}

// Process transfer operation
function processTransferOperation(op, txId, globalOpIndex, transactionsResult) {
    const fromAccount = op.value.from;
    const toAccount = op.value.to;
    const amount = op.value.amount;
    const memo = op.value.memo || "";

    // Determine currency symbol based on NAI
    let symbol = "HIVE";
    if (amount.nai === "@@000000013") {
        symbol = "HBD";
    }

    // Create FROM transaction (negative amount)
    transactionsResult.push({
        "transaction_identifier": {
            "hash": txId
        },
        "operations": [
            {
                "operation_identifier": {
                    "index": globalOpIndex
                },
                "related_operations": [
                    {
                        "index": globalOpIndex + 1
                    }
                ],
                "type": op.type,
                "status": "success",
                "account": {
                    "address": fromAccount
                },
                "amount": {
                    "value": `-${amount.amount}`,
                    "currency": {
                        "symbol": symbol,
                        "decimals": amount.precision
                    }
                },
                "metadata": {
                    "memo": memo
                }
            }
        ]
    });

    // Create TO transaction (positive amount)
    transactionsResult.push({
        "transaction_identifier": {
            "hash": txId
        },
        "operations": [
            {
                "operation_identifier": {
                    "index": globalOpIndex + 1
                },
                "related_operations": [
                    {
                        "index": globalOpIndex
                    }
                ],
                "type": op.type,
                "status": "success",
                "account": {
                    "address": toAccount
                },
                "amount": {
                    "value": amount.amount,
                    "currency": {
                        "symbol": symbol,
                        "decimals": amount.precision
                    }
                },
                "metadata": {
                    "memo": memo
                }
            }
        ]
    });

    return globalOpIndex + 2; // Return the next available index
}

// Process claim_reward_balance_operation
function processClaimRewardBalanceOperation(op, txId, startOpIndex, transactionsResult) {
    const account = op.value.account;
    const reward_hive = op.value.reward_hive;
    const reward_hbd = op.value.reward_hbd;

    let operations = [];
    let opIndex = startOpIndex;

    // Process HIVE rewards
    if (reward_hive && reward_hive.amount !== "0") {
        operations.push({
            "operation_identifier": {
                "index": opIndex++
            },
            "type": op.type,
            "status": "success",
            "account": {
                "address": account
            },
            "amount": {
                "value": reward_hive.amount,
                "currency": {
                    "symbol": "HIVE",
                    "decimals": reward_hive.precision
                }
            }
        });
    }

    // Process HBD rewards
    if (reward_hbd && reward_hbd.amount !== "0") {
        operations.push({
            "operation_identifier": {
                "index": opIndex++
            },
            "type": op.type,
            "status": "success",
            "account": {
                "address": account
            },
            "amount": {
                "value": reward_hbd.amount,
                "currency": {
                    "symbol": "HBD",
                    "decimals": reward_hbd.precision
                }
            }
        });
    }

    // Skip VESTS rewards as per requirements

    // Only add transaction if there are non-VESTS operations
    if (operations.length > 0) {
        transactionsResult.push({
            "transaction_identifier": {
                "hash": txId
            },
            "operations": operations
        });
    }

    return opIndex; // Return the next available index
}

// Process transfer_to_savings_operation
function processTransferToSavingsOperation(op, txId, opIndex, transactionsResult) {
    const from = op.value.from;
    const to = op.value.to;
    const amount = op.value.amount;
    const memo = op.value.memo || "";

    // Determine currency symbol based on NAI
    let symbol = "HIVE";
    if (amount.nai === "@@000000013") {
        symbol = "HBD";
    }

    // Create FROM transaction (negative amount)
    transactionsResult.push({
        "transaction_identifier": {
            "hash": txId
        },
        "operations": [
            {
                "operation_identifier": {
                    "index": opIndex
                },
                "type": op.type,
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
                    "memo": memo
                }
            }
        ]
    });

    return opIndex + 1; // Return the next available index
}

// Process collateralized_convert_operation
function processCollateralizedConvertOperation(op, txId, opIndex, transactionsResult) {
    const owner = op.value.owner;
    const amount = op.value.amount;
    const requestid = op.value.requestid;

    // For collateralized convert, the input is always HIVE
    transactionsResult.push({
        "transaction_identifier": {
            "hash": txId
        },
        "operations": [
            {
                "operation_identifier": {
                    "index": opIndex
                },
                "type": op.type,
                "status": "success",
                "account": {
                    "address": owner
                },
                "amount": {
                    "value": `-${amount.amount}`,
                    "currency": {
                        "symbol": "HIVE",
                        "decimals": amount.precision
                    }
                },
                "metadata": {
                    "request_id": requestid
                }
            }
        ]
    });

    return opIndex + 1; // Return the next available index
}

// Process convert_operation
function processConvertOperation(op, txId, opIndex, transactionsResult) {
    const owner = op.value.owner;
    const amount = op.value.amount;
    const requestid = op.value.requestid;

    let symbol = "HIVE";
    if (amount.nai === "@@000000013") {
        symbol = "HBD";
    }

    transactionsResult.push({
        "transaction_identifier": {
            "hash": txId
        },
        "operations": [
            {
                "operation_identifier": {
                    "index": opIndex
                },
                "type": op.type,
                "status": "success",
                "account": {
                    "address": owner
                },
                "amount": {
                    "value": `-${amount.amount}`,
                    "currency": {
                        "symbol": symbol,
                        "decimals": amount.precision
                    }
                },
                "metadata": {
                    "request_id": requestid
                }
            }
        ]
    });

    return opIndex + 1; // Return the next available index
}

// Process limit_order_create_operation
function processLimitOrderCreateOperation(op, txId, opIndex, transactionsResult) {
    const owner = op.value.owner;
    const amount_to_sell = op.value.amount_to_sell;
    const min_to_receive = op.value.min_to_receive;
    const orderid = op.value.orderid;
    const expiration = op.value.expiration;

    // Determine currency symbols
    let sellSymbol = "HIVE";
    if (amount_to_sell.nai === "@@000000013") {
        sellSymbol = "HBD";
    }

    let receiveSymbol = "HIVE";
    if (min_to_receive.nai === "@@000000013") {
        receiveSymbol = "HBD";
    }

    transactionsResult.push({
        "transaction_identifier": {
            "hash": txId
        },
        "operations": [
            {
                "operation_identifier": {
                    "index": opIndex
                },
                "type": op.type,
                "status": "success",
                "account": {
                    "address": owner
                },
                "amount": {
                    "value": `-${amount_to_sell.amount}`,
                    "currency": {
                        "symbol": sellSymbol,
                        "decimals": amount_to_sell.precision
                    }
                },
                "metadata": {
                    "min_to_receive": {
                        "value": min_to_receive.amount,
                        "currency": {
                            "symbol": receiveSymbol,
                            "decimals": min_to_receive.precision
                        }
                    },
                    "order_id": orderid,
                    "expiration": expiration
                }
            }
        ]
    });

    return opIndex + 1; // Return the next available index
}

// Process limit_order_create2_operation
function processLimitOrderCreate2Operation(op, txId, opIndex, transactionsResult) {
    const owner = op.value.owner;
    const amount_to_sell = op.value.amount_to_sell;
    const exchange_rate = op.value.exchange_rate;
    const orderid = op.value.orderid;
    const expiration = op.value.expiration;

    // Determine sell currency symbol
    let sellSymbol = "HIVE";
    if (amount_to_sell.nai === "@@000000013") {
        sellSymbol = "HBD";
    }

    transactionsResult.push({
        "transaction_identifier": {
            "hash": txId
        },
        "operations": [
            {
                "operation_identifier": {
                    "index": opIndex
                },
                "type": op.type,
                "status": "success",
                "account": {
                    "address": owner
                },
                "amount": {
                    "value": `-${amount_to_sell.amount}`,
                    "currency": {
                        "symbol": sellSymbol,
                        "decimals": amount_to_sell.precision
                    }
                },
                "metadata": {
                    "exchange_rate": {
                        "base": exchange_rate.base,
                        "quote": exchange_rate.quote
                    },
                    "fill_or_kill": op.value.fill_or_kill || false,
                    "order_id": orderid,
                    "expiration": expiration
                }
            }
        ]
    });

    return opIndex + 1; // Return the next available index
}

// Process transfer_to_vesting_operation
function processTransferToVestingOperation(op, txId, opIndex, transactionsResult) {
    const from = op.value.from;
    const to = op.value.to || from; // If "to" is not specified, it's the same as "from"
    const amount = op.value.amount;

    // Transfer to vesting is always in HIVE
    transactionsResult.push({
        "transaction_identifier": {
            "hash": txId
        },
        "operations": [
            {
                "operation_identifier": {
                    "index": opIndex
                },
                "type": op.type,
                "status": "success",
                "account": {
                    "address": from
                },
                "amount": {
                    "value": `-${amount.amount}`,
                    "currency": {
                        "symbol": "HIVE",
                        "decimals": amount.precision
                    }
                },
                "metadata": {
                    "to": to
                }
            }
        ]
    });

    // Skip the receiving VESTS since we're ignoring VESTS transactions
    return opIndex + 1; // Return the next available index
}

// Process account_create_operation
function processAccountCreateOperation(op, txId, opIndex, transactionsResult) {
    const creator = op.value.creator;
    const fee = op.value.fee;
    const new_account_name = op.value.new_account_name;

    transactionsResult.push({
        "transaction_identifier": {
            "hash": txId
        },
        "operations": [
            {
                "operation_identifier": {
                    "index": opIndex
                },
                "type": op.type,
                "status": "success",
                "account": {
                    "address": creator
                },
                "amount": {
                    "value": `-${fee.amount}`,
                    "currency": {
                        "symbol": "HIVE",
                        "decimals": fee.precision
                    }
                },
                "metadata": {
                    "new_account_name": new_account_name
                }
            }
        ]
    });

    return opIndex + 1; // Return the next available index
}

// Process account_create_with_delegation_operation
function processAccountCreateWithDelegationOperation(op, txId, opIndex, transactionsResult) {
    const creator = op.value.creator;
    const fee = op.value.fee;
    const new_account_name = op.value.new_account_name;

    transactionsResult.push({
        "transaction_identifier": {
            "hash": txId
        },
        "operations": [
            {
                "operation_identifier": {
                    "index": opIndex
                },
                "type": op.type,
                "status": "success",
                "account": {
                    "address": creator
                },
                "amount": {
                    "value": `-${fee.amount}`,
                    "currency": {
                        "symbol": "HIVE",
                        "decimals": fee.precision
                    }
                },
                "metadata": {
                    "new_account_name": new_account_name,
                }
            }
        ]
    });

    // Skip the delegation part since it involves VESTS
    return opIndex + 1; // Return the next available index
}

// Process escrow_transfer_operation
function processEscrowTransferOperation(op, txId, startOpIndex, transactionsResult) {
    const from = op.value.from;
    const to = op.value.to;
    const agent = op.value.agent;
    const escrow_id = op.value.escrow_id;
    const hive_amount = op.value.hive_amount;
    const hbd_amount = op.value.hbd_amount;
    const fee = op.value.fee;
    const ratification_deadline = op.value.ratification_deadline;
    const escrow_expiration = op.value.escrow_expiration;
    const json_meta = op.value.json_meta || "";

    let operations = [];
    let opIndex = startOpIndex;

    // Process HIVE amount (if not zero)
    if (hive_amount && hive_amount.amount !== "0") {
        operations.push({
            "operation_identifier": {
                "index": opIndex++
            },
            "type": op.type,
            "status": "success",
            "account": {
                "address": from
            },
            "amount": {
                "value": `-${hive_amount.amount}`,
                "currency": {
                    "symbol": "HIVE",
                    "decimals": hive_amount.precision
                }
            },
            "metadata": {
                "to": to,
                "agent": agent,
                "escrow_id": escrow_id,
                "ratification_deadline": ratification_deadline,
                "escrow_expiration": escrow_expiration,
                "json_meta": json_meta
            }
        });
    }

    // Process HBD amount (if not zero)
    if (hbd_amount && hbd_amount.amount !== "0") {
        operations.push({
            "operation_identifier": {
                "index": opIndex++
            },
            "type": op.type,
            "status": "success",
            "account": {
                "address": from
            },
            "amount": {
                "value": `-${hbd_amount.amount}`,
                "currency": {
                    "symbol": "HBD",
                    "decimals": hbd_amount.precision
                }
            },
            "metadata": {
                "to": to,
                "agent": agent,
                "escrow_id": escrow_id,
                "ratification_deadline": ratification_deadline,
                "escrow_expiration": escrow_expiration,
                "json_meta": json_meta
            }
        });
    }

    // Process fee (if not zero)
    if (fee && fee.amount !== "0") {
        // Determine currency symbol based on NAI
        let feeSymbol = "HIVE";
        if (fee.nai === "@@000000013") {
            feeSymbol = "HBD";
        }

        operations.push({
            "operation_identifier": {
                "index": opIndex++
            },
            "type": op.type,
            "status": "success",
            "account": {
                "address": from
            },
            "amount": {
                "value": `-${fee.amount}`,
                "currency": {
                    "symbol": feeSymbol,
                    "decimals": fee.precision
                }
            },
            "metadata": {
                "to": to,
                "agent": agent,
                "escrow_id": escrow_id,
                "ratification_deadline": ratification_deadline,
                "escrow_expiration": escrow_expiration,
                "json_meta": json_meta
            }
        });
    }

    // Only add transaction if there are operations
    if (operations.length > 0) {
        transactionsResult.push({
            "transaction_identifier": {
                "hash": txId
            },
            "operations": operations
        });
    }

    return opIndex; // Return the next available index
}

// Process escrow_release_operation
function processEscrowReleaseOperation(op, txId, startOpIndex, transactionsResult) {
    const from = op.value.from;
    const to = op.value.to;
    const agent = op.value.agent;
    const who = op.value.who;
    const receiver = op.value.receiver;
    const escrow_id = op.value.escrow_id;
    const hive_amount = op.value.hive_amount;
    const hbd_amount = op.value.hbd_amount;

    let operations = [];
    let opIndex = startOpIndex;

    // Process HIVE amount (if not zero)
    if (hive_amount && hive_amount.amount !== "0") {
        operations.push({
            "operation_identifier": {
                "index": opIndex++
            },
            "type": op.type,
            "status": "success",
            "account": {
                "address": receiver
            },
            "amount": {
                "value": hive_amount.amount,
                "currency": {
                    "symbol": "HIVE",
                    "decimals": hive_amount.precision
                }
            },
            "metadata": {
                "from": from,
                "to": to,
                "agent": agent,
                "who": who,
                "escrow_id": escrow_id
            }
        });
    }

    // Process HBD amount (if not zero)
    if (hbd_amount && hbd_amount.amount !== "0") {
        operations.push({
            "operation_identifier": {
                "index": opIndex++
            },
            "type": op.type,
            "status": "success",
            "account": {
                "address": receiver
            },
            "amount": {
                "value": hbd_amount.amount,
                "currency": {
                    "symbol": "HBD",
                    "decimals": hbd_amount.precision
                }
            },
            "metadata": {
                "from": from,
                "to": to,
                "agent": agent,
                "who": who,
                "escrow_id": escrow_id
            }
        });
    }

    // Only add transaction if there are operations
    if (operations.length > 0) {
        transactionsResult.push({
            "transaction_identifier": {
                "hash": txId
            },
            "operations": operations
        });
    }

    return opIndex; // Return the next available index
}

export {
    processOperations,
    isOperationSupported
};