// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

interface IRobotRegistry {
    struct Robot {
        address owner;
        string name;
        string robotType;
        bytes32 storageRoot;
        bool active;
        uint256 registeredAt;
    }

    event RobotRegistered(bytes32 indexed robotId, address indexed owner, string name, string robotType);
    event RobotUpdated(bytes32 indexed robotId);
    event ControllerAdded(bytes32 indexed robotId, address indexed controller);
    event ControllerRemoved(bytes32 indexed robotId, address indexed controller);
    event CommandPriceSet(bytes32 indexed robotId, uint256 price);

    function registerRobot(bytes32 robotId, string calldata name, string calldata robotType, bytes32 storageRoot) external;
    function updateRobot(bytes32 robotId, bytes32 storageRoot, bool active) external;
    function addController(bytes32 robotId, address controller) external;
    function removeController(bytes32 robotId, address controller) external;
    function setCommandPrice(bytes32 robotId, uint256 price) external;
    function isAuthorized(bytes32 robotId, address caller) external view returns (bool);
    function getRobot(bytes32 robotId) external view returns (Robot memory);
    function getCommandPrice(bytes32 robotId) external view returns (uint256);
}
