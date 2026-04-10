// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

interface IRobotCommandDispatcher {
    enum CommandStatus { Pending, Executed, Failed, Expired }

    struct Command {
        bytes32 robotId;
        address sender;
        uint32 apiId;
        string parameters;
        uint256 value;
        uint256 timestamp;
        uint256 nonce;
        CommandStatus status;
    }

    event CommandDispatched(
        bytes32 indexed robotId,
        uint256 indexed nonce,
        address indexed sender,
        uint32 apiId,
        string parameters,
        uint256 value
    );

    event CommandExecuted(
        bytes32 indexed robotId,
        uint256 indexed nonce,
        bool success,
        string resultData
    );

    event BalanceWithdrawn(bytes32 indexed robotId, address indexed owner, uint256 amount);

    function dispatchCommand(bytes32 robotId, uint32 apiId, string calldata parameters) external payable;
    function dispatchBatch(bytes32 robotId, uint32[] calldata apiIds, string[] calldata parameters) external payable;
    function submitReceipt(bytes32 robotId, uint256 nonce, bool success, string calldata resultData) external;
    function withdrawBalance(bytes32 robotId) external;
    function getCommand(bytes32 robotId, uint256 nonce) external view returns (Command memory);
    function getPendingCommands(bytes32 robotId, uint256 fromNonce, uint256 count) external view returns (Command[] memory);
    function getRobotNonce(bytes32 robotId) external view returns (uint256);
}
