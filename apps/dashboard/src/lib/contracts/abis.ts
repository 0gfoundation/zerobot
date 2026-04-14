export const REGISTRY_ADDRESS = '0xBb42945B9ec1FD084da18Ad429338809e82eD4E2' as const;
export const DISPATCHER_ADDRESS = '0x380498cE316a860c900541603017Bd4F41A11DC4' as const;

export const REGISTRY_ABI = [
	{
		type: 'function',
		name: 'registerRobot',
		inputs: [
			{ name: 'robotId', type: 'bytes32' },
			{ name: 'name', type: 'string' },
			{ name: 'robotType', type: 'string' },
			{ name: 'storageRoot', type: 'bytes32' }
		],
		outputs: [],
		stateMutability: 'nonpayable'
	},
	{
		type: 'function',
		name: 'updateRobot',
		inputs: [
			{ name: 'robotId', type: 'bytes32' },
			{ name: 'storageRoot', type: 'bytes32' },
			{ name: 'active', type: 'bool' }
		],
		outputs: [],
		stateMutability: 'nonpayable'
	},
	{
		type: 'function',
		name: 'addController',
		inputs: [
			{ name: 'robotId', type: 'bytes32' },
			{ name: 'controller', type: 'address' }
		],
		outputs: [],
		stateMutability: 'nonpayable'
	},
	{
		type: 'function',
		name: 'removeController',
		inputs: [
			{ name: 'robotId', type: 'bytes32' },
			{ name: 'controller', type: 'address' }
		],
		outputs: [],
		stateMutability: 'nonpayable'
	},
	{
		type: 'function',
		name: 'setCommandPrice',
		inputs: [
			{ name: 'robotId', type: 'bytes32' },
			{ name: 'price', type: 'uint256' }
		],
		outputs: [],
		stateMutability: 'nonpayable'
	},
	{
		type: 'function',
		name: 'isAuthorized',
		inputs: [
			{ name: 'robotId', type: 'bytes32' },
			{ name: 'caller', type: 'address' }
		],
		outputs: [{ name: '', type: 'bool' }],
		stateMutability: 'view'
	},
	{
		type: 'function',
		name: 'getRobot',
		inputs: [{ name: 'robotId', type: 'bytes32' }],
		outputs: [
			{
				name: '',
				type: 'tuple',
				components: [
					{ name: 'owner', type: 'address' },
					{ name: 'name', type: 'string' },
					{ name: 'robotType', type: 'string' },
					{ name: 'storageRoot', type: 'bytes32' },
					{ name: 'active', type: 'bool' },
					{ name: 'registeredAt', type: 'uint256' }
				]
			}
		],
		stateMutability: 'view'
	},
	{
		type: 'function',
		name: 'getCommandPrice',
		inputs: [{ name: 'robotId', type: 'bytes32' }],
		outputs: [{ name: '', type: 'uint256' }],
		stateMutability: 'view'
	},
	{
		type: 'event',
		name: 'RobotRegistered',
		inputs: [
			{ name: 'robotId', type: 'bytes32', indexed: true },
			{ name: 'owner', type: 'address', indexed: true },
			{ name: 'name', type: 'string', indexed: false },
			{ name: 'robotType', type: 'string', indexed: false }
		]
	}
] as const;

export const DISPATCHER_ABI = [
	{
		type: 'function',
		name: 'dispatchCommand',
		inputs: [
			{ name: 'robotId', type: 'bytes32' },
			{ name: 'apiId', type: 'uint32' },
			{ name: 'parameters', type: 'string' }
		],
		outputs: [],
		stateMutability: 'payable'
	},
	{
		type: 'function',
		name: 'dispatchBatch',
		inputs: [
			{ name: 'robotId', type: 'bytes32' },
			{ name: 'apiIds', type: 'uint32[]' },
			{ name: 'parameters', type: 'string[]' }
		],
		outputs: [],
		stateMutability: 'payable'
	},
	{
		type: 'function',
		name: 'getRobotNonce',
		inputs: [{ name: 'robotId', type: 'bytes32' }],
		outputs: [{ name: '', type: 'uint256' }],
		stateMutability: 'view'
	},
	{
		type: 'event',
		name: 'CommandDispatched',
		inputs: [
			{ name: 'robotId', type: 'bytes32', indexed: true },
			{ name: 'nonce', type: 'uint256', indexed: true },
			{ name: 'sender', type: 'address', indexed: true },
			{ name: 'apiId', type: 'uint32', indexed: false },
			{ name: 'parameters', type: 'string', indexed: false },
			{ name: 'value', type: 'uint256', indexed: false }
		]
	}
] as const;
