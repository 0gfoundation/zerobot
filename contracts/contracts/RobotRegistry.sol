// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.27;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {MulticallUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";
import "./interfaces/IRobotRegistry.sol";

/// Deployed behind a UUPS proxy. This contract's own `owner()` is the
/// upgrade admin, unrelated to each robot's owner. It can be handed to a
/// timelock run by a multisig later with `transferOwnership`, which the new
/// owner accepts with `acceptOwnership` (Ownable2Step).
///
/// `multicall` batches a robot owner's calls into one transaction, e.g.
/// register, set the price, open to the public and add an operator. Each
/// call runs as the original sender, so the robot-owner checks still apply.
contract RobotRegistry is
    IRobotRegistry,
    Initializable,
    UUPSUpgradeable,
    Ownable2StepUpgradeable,
    MulticallUpgradeable
{
    mapping(bytes32 => Robot) private _robots;
    mapping(bytes32 => mapping(address => bool)) private _controllers;
    // Machines running the robot's operator node: they submit receipts and
    // nothing else, so the owner's wallet never has to live on one
    mapping(bytes32 => mapping(address => bool)) private _operators;
    mapping(bytes32 => uint256) private _commandPrices;
    mapping(bytes32 => RobotStatus) private _status;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address upgradeAdmin) external initializer {
        __Ownable_init(upgradeAdmin);
        __Ownable2Step_init();
        __Multicall_init();
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    modifier onlyRobotOwner(bytes32 robotId) {
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
    ) external onlyRobotOwner(robotId) {
        _robots[robotId].storageRoot = storageRoot;
        _robots[robotId].active = active;
        emit RobotUpdated(robotId);
    }

    function addController(
        bytes32 robotId,
        address controller
    ) external onlyRobotOwner(robotId) {
        require(controller != address(0), "Invalid controller");
        _controllers[robotId][controller] = true;
        emit ControllerAdded(robotId, controller);
    }

    function removeController(
        bytes32 robotId,
        address controller
    ) external onlyRobotOwner(robotId) {
        _controllers[robotId][controller] = false;
        emit ControllerRemoved(robotId, controller);
    }

    function addOperator(
        bytes32 robotId,
        address operator
    ) external onlyRobotOwner(robotId) {
        require(operator != address(0), "Invalid operator");
        _operators[robotId][operator] = true;
        emit OperatorAdded(robotId, operator);
    }

    function removeOperator(
        bytes32 robotId,
        address operator
    ) external onlyRobotOwner(robotId) {
        _operators[robotId][operator] = false;
        emit OperatorRemoved(robotId, operator);
    }

    function isOperator(
        bytes32 robotId,
        address caller
    ) external view returns (bool) {
        return _operators[robotId][caller];
    }

    function reportStatus(
        bytes32 robotId,
        bool online,
        bool robotConnected,
        uint8 battery
    ) external {
        require(
            _robots[robotId].owner == msg.sender || _operators[robotId][msg.sender],
            "Only robot owner or operator can report status"
        );
        require(battery <= 100 || battery == 255, "Invalid battery");
        _status[robotId] = RobotStatus({
            online: online,
            robotConnected: robotConnected,
            battery: battery,
            updatedAt: uint64(block.timestamp),
            reporter: msg.sender
        });
        emit StatusReported(robotId, msg.sender, online, robotConnected, battery);
    }

    function getStatus(bytes32 robotId) external view returns (RobotStatus memory) {
        return _status[robotId];
    }

    function setCommandPrice(
        bytes32 robotId,
        uint256 price
    ) external onlyRobotOwner(robotId) {
        _commandPrices[robotId] = price;
        emit CommandPriceSet(robotId, price);
    }

    function setPublicCommands(
        bytes32 robotId,
        bool enabled
    ) external onlyRobotOwner(robotId) {
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
