// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "./interfaces/IRobotRegistry.sol";

contract RobotRegistry is IRobotRegistry {
    mapping(bytes32 => Robot) private _robots;
    mapping(bytes32 => mapping(address => bool)) private _controllers;
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
        string calldata robotType,
        string calldata metadataURI
    ) external {
        require(_robots[robotId].owner == address(0), "Robot already registered");

        _robots[robotId] = Robot({
            owner: msg.sender,
            robotType: robotType,
            metadataURI: metadataURI,
            active: true,
            registeredAt: block.timestamp
        });

        emit RobotRegistered(robotId, msg.sender, robotType);
    }

    function updateRobot(
        bytes32 robotId,
        string calldata metadataURI,
        bool active
    ) external onlyOwner(robotId) {
        _robots[robotId].metadataURI = metadataURI;
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

    function setCommandPrice(
        bytes32 robotId,
        uint256 price
    ) external onlyOwner(robotId) {
        _commandPrices[robotId] = price;
        emit CommandPriceSet(robotId, price);
    }

    function isAuthorized(
        bytes32 robotId,
        address caller
    ) external view returns (bool) {
        Robot storage robot = _robots[robotId];
        if (robot.owner == address(0)) return false;
        if (!robot.active) return false;
        return robot.owner == caller || _controllers[robotId][caller];
    }

    function getRobot(bytes32 robotId) external view returns (Robot memory) {
        return _robots[robotId];
    }

    function getCommandPrice(bytes32 robotId) external view returns (uint256) {
        return _commandPrices[robotId];
    }
}
