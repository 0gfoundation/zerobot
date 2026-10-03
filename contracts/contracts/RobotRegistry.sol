// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "./interfaces/IRobotRegistry.sol";

contract RobotRegistry is IRobotRegistry {
    mapping(bytes32 => Robot) private _robots;
    mapping(bytes32 => mapping(address => bool)) private _controllers;
    // Machines running the robot's operator node: they submit receipts and
    // nothing else, so the owner's wallet never has to live on one
    mapping(bytes32 => mapping(address => bool)) private _operators;
    mapping(bytes32 => uint256) private _commandPrices;

    modifier onlyOwner(bytes32 robotId) {
        require(_robots[robotId].owner == msg.sender, "Not robot owner");
        _;
    }

    modifier robotExists(bytes32 robotId) {
        require(_robots[robotId].owner != address(0), "Robot not registered");
        _;
    }

    function registerRobot(
        bytes32 robotId,
        string calldata name,
        string calldata robotType,
        bytes32 storageRoot
    ) external {
        require(_robots[robotId].owner == address(0), "Robot already registered");

        _robots[robotId] = Robot({
            owner: msg.sender,
            name: name,
            robotType: robotType,
            storageRoot: storageRoot,
            active: true,
            publicCommands: false,
            registeredAt: block.timestamp
        });

        emit RobotRegistered(robotId, msg.sender, name, robotType);
    }

    function updateRobot(
        bytes32 robotId,
        bytes32 storageRoot,
        bool active
    ) external onlyOwner(robotId) {
        _robots[robotId].storageRoot = storageRoot;
        _robots[robotId].active = active;
        emit RobotUpdated(robotId);
    }

    function addController(
        bytes32 robotId,
        address controller
    ) external onlyOwner(robotId) {
        require(controller != address(0), "Invalid controller");
        _controllers[robotId][controller] = true;
        emit ControllerAdded(robotId, controller);
    }

    function removeController(
        bytes32 robotId,
        address controller
    ) external onlyOwner(robotId) {
        _controllers[robotId][controller] = false;
        emit ControllerRemoved(robotId, controller);
    }

    function addOperator(
        bytes32 robotId,
        address operator
    ) external onlyOwner(robotId) {
        require(operator != address(0), "Invalid operator");
        _operators[robotId][operator] = true;
        emit OperatorAdded(robotId, operator);
    }

    function removeOperator(
        bytes32 robotId,
        address operator
    ) external onlyOwner(robotId) {
        _operators[robotId][operator] = false;
        emit OperatorRemoved(robotId, operator);
    }

    function isOperator(
        bytes32 robotId,
        address caller
    ) external view returns (bool) {
        return _operators[robotId][caller];
    }

    function setCommandPrice(
        bytes32 robotId,
        uint256 price
    ) external onlyOwner(robotId) {
        _commandPrices[robotId] = price;
        emit CommandPriceSet(robotId, price);
    }

    function setPublicCommands(
        bytes32 robotId,
        bool enabled
    ) external onlyOwner(robotId) {
        _robots[robotId].publicCommands = enabled;
        emit PublicCommandsSet(robotId, enabled);
    }

    function isAuthorized(
        bytes32 robotId,
        address caller
    ) external view returns (bool) {
        Robot storage robot = _robots[robotId];
        if (robot.owner == address(0)) return false;
        if (!robot.active) return false;
        return
            robot.publicCommands ||
            robot.owner == caller ||
            _controllers[robotId][caller];
    }

    function getRobot(bytes32 robotId) external view returns (Robot memory) {
        return _robots[robotId];
    }

    function getCommandPrice(bytes32 robotId) external view returns (uint256) {
        return _commandPrices[robotId];
    }
}
