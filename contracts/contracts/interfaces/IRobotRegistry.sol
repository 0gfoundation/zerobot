// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.27;

interface IRobotRegistry {
    struct Robot {
        address owner;
        string name;
        string robotType;
        bytes32 storageRoot;
        bool active;
        // Anyone may dispatch (paying the command price), not just the
        // owner and controllers
        bool publicCommands;
        uint256 registeredAt;
    }

    event RobotRegistered(bytes32 indexed robotId, address indexed owner, string name, string robotType);
    event RobotUpdated(bytes32 indexed robotId);
    event ControllerAdded(bytes32 indexed robotId, address indexed controller);
    event ControllerRemoved(bytes32 indexed robotId, address indexed controller);
    event OperatorAdded(bytes32 indexed robotId, address indexed operator);
    event OperatorRemoved(bytes32 indexed robotId, address indexed operator);
    event CommandPriceSet(bytes32 indexed robotId, uint256 price);
    event PublicCommandsSet(bytes32 indexed robotId, bool enabled);

    function registerRobot(bytes32 robotId, string calldata name, string calldata robotType, bytes32 storageRoot) external;
    function updateRobot(bytes32 robotId, bytes32 storageRoot, bool active) external;
    function addController(bytes32 robotId, address controller) external;
    function removeController(bytes32 robotId, address controller) external;
    function addOperator(bytes32 robotId, address operator) external;
    function removeOperator(bytes32 robotId, address operator) external;
    function isOperator(bytes32 robotId, address caller) external view returns (bool);
    function setCommandPrice(bytes32 robotId, uint256 price) external;
    function setPublicCommands(bytes32 robotId, bool enabled) external;
    function isAuthorized(bytes32 robotId, address caller) external view returns (bool);
    function getRobot(bytes32 robotId) external view returns (Robot memory);
    function getCommandPrice(bytes32 robotId) external view returns (uint256);
}
