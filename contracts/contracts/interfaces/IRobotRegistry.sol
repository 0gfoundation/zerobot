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
    /// The operator's latest report on itself and the robot. A stand-in until
    /// status moves to an off-chain network; pages treat an old `updatedAt`
    /// as offline.
    struct RobotStatus {
        bool online;
        bool robotConnected;
        /// Battery charge 0-100, or 255 when unknown
        uint8 battery;
        uint64 updatedAt;
        address reporter;
    }

    event CommandPriceSet(bytes32 indexed robotId, uint256 price);
    event StatusReported(
        bytes32 indexed robotId,
        address indexed reporter,
        bool online,
        bool robotConnected,
        uint8 battery
    );
    event PublicCommandsSet(bytes32 indexed robotId, bool enabled);
    event QueuePausedSet(bytes32 indexed robotId, address indexed by, bool paused);

    function registerRobot(bytes32 robotId, string calldata name, string calldata robotType, bytes32 storageRoot) external;
    function updateRobot(bytes32 robotId, bytes32 storageRoot, bool active) external;
    function addController(bytes32 robotId, address controller) external;
    function removeController(bytes32 robotId, address controller) external;
    function addOperator(bytes32 robotId, address operator) external;
    function removeOperator(bytes32 robotId, address operator) external;
    function isOperator(bytes32 robotId, address caller) external view returns (bool);
    function setCommandPrice(bytes32 robotId, uint256 price) external;
    function reportStatus(bytes32 robotId, bool online, bool robotConnected, uint8 battery) external;
    function getStatus(bytes32 robotId) external view returns (RobotStatus memory);
    function setPublicCommands(bytes32 robotId, bool enabled) external;
    function setQueuePaused(bytes32 robotId, bool paused) external;
    function isQueuePaused(bytes32 robotId) external view returns (bool);
    function isAuthorized(bytes32 robotId, address caller) external view returns (bool);
    function getRobot(bytes32 robotId) external view returns (Robot memory);
    function getCommandPrice(bytes32 robotId) external view returns (uint256);
}
