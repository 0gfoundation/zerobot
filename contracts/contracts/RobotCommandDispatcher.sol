// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "./interfaces/IRobotCommandDispatcher.sol";
import "./interfaces/IRobotRegistry.sol";

contract RobotCommandDispatcher is IRobotCommandDispatcher {
    IRobotRegistry public immutable registry;

    mapping(bytes32 => uint256) private _robotNonce;
    mapping(bytes32 => mapping(uint256 => Command)) private _commands;
    mapping(bytes32 => uint256) private _pendingBalance;

    uint256 public constant COMMAND_EXPIRY = 5 minutes;
    uint256 public constant MAX_NOTE_LENGTH = 64;

    constructor(address registryAddress) {
        registry = IRobotRegistry(registryAddress);
    }

    function dispatchCommand(
        bytes32 robotId,
        uint32 apiId,
        string calldata parameters,
        string calldata note
    ) external payable {
        _dispatch(robotId, apiId, parameters, note);
    }

    function dispatchBatch(
        bytes32 robotId,
        uint32[] calldata apiIds,
        string[] calldata parameters,
        string calldata note
    ) external payable {
        require(apiIds.length == parameters.length, "Array length mismatch");
        require(apiIds.length > 0, "Empty batch");
        require(bytes(note).length <= MAX_NOTE_LENGTH, "Note too long");

        uint256 price = registry.getCommandPrice(robotId);
        if (price > 0) {
            require(msg.value >= price * apiIds.length, "Insufficient payment");
        }

        // Check authorization once
        require(registry.isAuthorized(robotId, msg.sender), "Not authorized");

        for (uint256 i = 0; i < apiIds.length; i++) {
            _dispatchInternal(robotId, apiIds[i], parameters[i], note);
        }

        if (price > 0) {
            _pendingBalance[robotId] += msg.value;
        }
    }

    function submitReceipt(
        bytes32 robotId,
        uint256 nonce,
        bool success,
        string calldata resultData
    ) external {
        IRobotRegistry.Robot memory robot = registry.getRobot(robotId);
        require(robot.owner == msg.sender, "Only robot owner can submit receipts");

        Command storage cmd = _commands[robotId][nonce];
        require(cmd.timestamp > 0, "Command does not exist");
        require(cmd.status == CommandStatus.Pending, "Command already processed");

        cmd.status = success ? CommandStatus.Executed : CommandStatus.Failed;
        emit CommandExecuted(robotId, nonce, success, resultData);
    }

    function withdrawBalance(bytes32 robotId) external {
        IRobotRegistry.Robot memory robot = registry.getRobot(robotId);
        require(robot.owner == msg.sender, "Only robot owner can withdraw");

        uint256 amount = _pendingBalance[robotId];
        require(amount > 0, "No balance to withdraw");

        _pendingBalance[robotId] = 0;
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "Transfer failed");

        emit BalanceWithdrawn(robotId, msg.sender, amount);
    }

    function getCommand(
        bytes32 robotId,
        uint256 nonce
    ) external view returns (Command memory) {
        return _commands[robotId][nonce];
    }

    function getPendingCommands(
        bytes32 robotId,
        uint256 fromNonce,
        uint256 count
    ) external view returns (Command[] memory) {
        uint256 currentNonce = _robotNonce[robotId];
        uint256 end = fromNonce + count;
        if (end > currentNonce) {
            end = currentNonce;
        }

        uint256 resultCount = 0;
        for (uint256 i = fromNonce; i < end; i++) {
            if (_commands[robotId][i].status == CommandStatus.Pending) {
                resultCount++;
            }
        }

        Command[] memory result = new Command[](resultCount);
        uint256 idx = 0;
        for (uint256 i = fromNonce; i < end; i++) {
            if (_commands[robotId][i].status == CommandStatus.Pending) {
                result[idx] = _commands[robotId][i];
                idx++;
            }
        }

        return result;
    }

    function getRobotNonce(bytes32 robotId) external view returns (uint256) {
        return _robotNonce[robotId];
    }

    function _dispatch(
        bytes32 robotId,
        uint32 apiId,
        string calldata parameters,
        string calldata note
    ) internal {
        require(registry.isAuthorized(robotId, msg.sender), "Not authorized");
        require(bytes(note).length <= MAX_NOTE_LENGTH, "Note too long");

        uint256 price = registry.getCommandPrice(robotId);
        if (price > 0) {
            require(msg.value >= price, "Insufficient payment");
            _pendingBalance[robotId] += msg.value;
        }

        _dispatchInternal(robotId, apiId, parameters, note);
    }

    function _dispatchInternal(
        bytes32 robotId,
        uint32 apiId,
        string calldata parameters,
        string calldata note
    ) internal {
        uint256 nonce = _robotNonce[robotId]++;

        _commands[robotId][nonce] = Command({
            robotId: robotId,
            sender: msg.sender,
            apiId: apiId,
            parameters: parameters,
            note: note,
            value: msg.value,
            timestamp: block.timestamp,
            nonce: nonce,
            status: CommandStatus.Pending
        });

        emit CommandDispatched(robotId, nonce, msg.sender, apiId, parameters, note, msg.value);
    }
}
