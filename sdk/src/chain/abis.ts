// Auto-generated from contract artifacts — do not edit manually

export const REGISTRY_ABI = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "robotId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "price",
        "type": "uint256"
      }
    ],
    "name": "CommandPriceSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "robotId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "controller",
        "type": "address"
      }
    ],
    "name": "ControllerAdded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "robotId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "controller",
        "type": "address"
      }
    ],
    "name": "ControllerRemoved",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "robotId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "enabled",
        "type": "bool"
      }
    ],
    "name": "PublicCommandsSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "robotId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "robotType",
        "type": "string"
      }
    ],
    "name": "RobotRegistered",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "robotId",
        "type": "bytes32"
      }
    ],
    "name": "RobotUpdated",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "robotId",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "controller",
        "type": "address"
      }
    ],
    "name": "addController",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "robotId",
        "type": "bytes32"
      }
    ],
    "name": "getCommandPrice",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "robotId",
        "type": "bytes32"
      }
    ],
    "name": "getRobot",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "owner",
            "type": "address"
          },
          {
            "internalType": "string",
            "name": "name",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "robotType",
            "type": "string"
          },
          {
            "internalType": "bytes32",
            "name": "storageRoot",
            "type": "bytes32"
          },
          {
            "internalType": "bool",
            "name": "active",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "publicCommands",
            "type": "bool"
          },
          {
            "internalType": "uint256",
            "name": "registeredAt",
            "type": "uint256"
          }
        ],
        "internalType": "struct IRobotRegistry.Robot",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "robotId",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "caller",
        "type": "address"
      }
    ],
    "name": "isAuthorized",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "robotId",
        "type": "bytes32"
      },
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "robotType",
        "type": "string"
      },
      {
        "internalType": "bytes32",
        "name": "storageRoot",
        "type": "bytes32"
      }
    ],
    "name": "registerRobot",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "robotId",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "controller",
        "type": "address"
      }
    ],
    "name": "removeController",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "robotId",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "price",
        "type": "uint256"
      }
    ],
    "name": "setCommandPrice",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "robotId",
        "type": "bytes32"
      },
      {
        "internalType": "bool",
        "name": "enabled",
        "type": "bool"
      }
    ],
    "name": "setPublicCommands",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "robotId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "storageRoot",
        "type": "bytes32"
      },
      {
        "internalType": "bool",
        "name": "active",
        "type": "bool"
      }
    ],
    "name": "updateRobot",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

export const DISPATCHER_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "registryAddress",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "robotId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "BalanceWithdrawn",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "robotId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "nonce",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "sender",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "apiId",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "parameters",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "note",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "value",
        "type": "uint256"
      }
    ],
    "name": "CommandDispatched",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "robotId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "nonce",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "success",
        "type": "bool"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "resultData",
        "type": "string"
      }
    ],
    "name": "CommandExecuted",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "COMMAND_EXPIRY",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MAX_NOTE_LENGTH",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "robotId",
        "type": "bytes32"
      },
      {
        "internalType": "uint32[]",
        "name": "apiIds",
        "type": "uint32[]"
      },
      {
        "internalType": "string[]",
        "name": "parameters",
        "type": "string[]"
      },
      {
        "internalType": "string",
        "name": "note",
        "type": "string"
      }
    ],
    "name": "dispatchBatch",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "robotId",
        "type": "bytes32"
      },
      {
        "internalType": "uint32",
        "name": "apiId",
        "type": "uint32"
      },
      {
        "internalType": "string",
        "name": "parameters",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "note",
        "type": "string"
      }
    ],
    "name": "dispatchCommand",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "robotId",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "nonce",
        "type": "uint256"
      }
    ],
    "name": "getCommand",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "robotId",
            "type": "bytes32"
          },
          {
            "internalType": "address",
            "name": "sender",
            "type": "address"
          },
          {
            "internalType": "uint32",
            "name": "apiId",
            "type": "uint32"
          },
          {
            "internalType": "string",
            "name": "parameters",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "note",
            "type": "string"
          },
          {
            "internalType": "uint256",
            "name": "value",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "timestamp",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "nonce",
            "type": "uint256"
          },
          {
            "internalType": "enum IRobotCommandDispatcher.CommandStatus",
            "name": "status",
            "type": "uint8"
          }
        ],
        "internalType": "struct IRobotCommandDispatcher.Command",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "robotId",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "fromNonce",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "count",
        "type": "uint256"
      }
    ],
    "name": "getPendingCommands",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "robotId",
            "type": "bytes32"
          },
          {
            "internalType": "address",
            "name": "sender",
            "type": "address"
          },
          {
            "internalType": "uint32",
            "name": "apiId",
            "type": "uint32"
          },
          {
            "internalType": "string",
            "name": "parameters",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "note",
            "type": "string"
          },
          {
            "internalType": "uint256",
            "name": "value",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "timestamp",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "nonce",
            "type": "uint256"
          },
          {
            "internalType": "enum IRobotCommandDispatcher.CommandStatus",
            "name": "status",
            "type": "uint8"
          }
        ],
        "internalType": "struct IRobotCommandDispatcher.Command[]",
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "robotId",
        "type": "bytes32"
      }
    ],
    "name": "getRobotNonce",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "registry",
    "outputs": [
      {
        "internalType": "contract IRobotRegistry",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "robotId",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "nonce",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "success",
        "type": "bool"
      },
      {
        "internalType": "string",
        "name": "resultData",
        "type": "string"
      }
    ],
    "name": "submitReceipt",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "robotId",
        "type": "bytes32"
      }
    ],
    "name": "withdrawBalance",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
