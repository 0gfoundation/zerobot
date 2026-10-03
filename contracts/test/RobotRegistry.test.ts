import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("RobotRegistry", function () {
  async function deployFixture() {
    const [owner, controller, other] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("RobotRegistry");
    const registry = await upgrades.deployProxy(Registry, [owner.address], { kind: "uups" });
    const robotId = ethers.keccak256(ethers.toUtf8Bytes("go2-pro-001"));
    return { registry, owner, controller, other, robotId };
  }

  const ZERO_ROOT = ethers.ZeroHash;
  const SAMPLE_ROOT = ethers.keccak256(ethers.toUtf8Bytes("storage-root-1"));

  describe("Registration", function () {
    it("should register a robot", async function () {
      const { registry, owner, robotId } = await loadFixture(deployFixture);

      await expect(
        registry.registerRobot(robotId, "go2-pro-001", "go2_pro", ZERO_ROOT)
      )
        .to.emit(registry, "RobotRegistered")
        .withArgs(robotId, owner.address, "go2-pro-001", "go2_pro");

      const robot = await registry.getRobot(robotId);
      expect(robot.owner).to.equal(owner.address);
      expect(robot.name).to.equal("go2-pro-001");
      expect(robot.robotType).to.equal("go2_pro");
      expect(robot.active).to.be.true;
    });

    it("should reject duplicate registration", async function () {
      const { registry, robotId } = await loadFixture(deployFixture);
      await registry.registerRobot(robotId, "go2-pro-001", "go2_pro", ZERO_ROOT);
      await expect(
        registry.registerRobot(robotId, "go2-pro-001", "go2_pro", ZERO_ROOT)
      ).to.be.revertedWith("Robot already registered");
    });
  });

  describe("Update", function () {
    it("should allow owner to update", async function () {
      const { registry, robotId } = await loadFixture(deployFixture);
      await registry.registerRobot(robotId, "go2-pro-001", "go2_pro", ZERO_ROOT);

      await expect(registry.updateRobot(robotId, SAMPLE_ROOT, false))
        .to.emit(registry, "RobotUpdated")
        .withArgs(robotId);

      const robot = await registry.getRobot(robotId);
      expect(robot.storageRoot).to.equal(SAMPLE_ROOT);
      expect(robot.active).to.be.false;
    });

    it("should reject non-owner update", async function () {
      const { registry, other, robotId } = await loadFixture(deployFixture);
      await registry.registerRobot(robotId, "go2-pro-001", "go2_pro", ZERO_ROOT);
      await expect(
        registry.connect(other).updateRobot(robotId, ZERO_ROOT, true)
      ).to.be.revertedWith("Not robot owner");
    });
  });

  describe("Controller Management", function () {
    it("should add and remove controllers", async function () {
      const { registry, controller, robotId } =
        await loadFixture(deployFixture);
      await registry.registerRobot(robotId, "go2-pro-001", "go2_pro", ZERO_ROOT);

      await expect(registry.addController(robotId, controller.address))
        .to.emit(registry, "ControllerAdded")
        .withArgs(robotId, controller.address);

      expect(await registry.isAuthorized(robotId, controller.address)).to.be
        .true;

      await registry.removeController(robotId, controller.address);
      expect(await registry.isAuthorized(robotId, controller.address)).to.be
        .false;
    });
  });

  describe("Operator Management", function () {
    it("should add and remove operators", async function () {
      const { registry, controller, robotId } = await loadFixture(deployFixture);
      await registry.registerRobot(robotId, "go2-pro-001", "go2_pro", ZERO_ROOT);

      await expect(registry.addOperator(robotId, controller.address))
        .to.emit(registry, "OperatorAdded")
        .withArgs(robotId, controller.address);
      expect(await registry.isOperator(robotId, controller.address)).to.be.true;

      await expect(registry.removeOperator(robotId, controller.address))
        .to.emit(registry, "OperatorRemoved")
        .withArgs(robotId, controller.address);
      expect(await registry.isOperator(robotId, controller.address)).to.be.false;
    });

    it("should not let an operator dispatch to a private robot", async function () {
      const { registry, controller, robotId } = await loadFixture(deployFixture);
      await registry.registerRobot(robotId, "go2-pro-001", "go2_pro", ZERO_ROOT);
      await registry.addOperator(robotId, controller.address);
      expect(await registry.isAuthorized(robotId, controller.address)).to.be.false;
    });

    it("should reject operator changes from non-owner", async function () {
      const { registry, other, controller, robotId } = await loadFixture(deployFixture);
      await registry.registerRobot(robotId, "go2-pro-001", "go2_pro", ZERO_ROOT);
      await expect(
        registry.connect(other).addOperator(robotId, controller.address)
      ).to.be.revertedWith("Not robot owner");
    });
  });

  describe("Multicall", function () {
    it("should register and configure a robot in one transaction", async function () {
      const { registry, owner, controller, other, robotId } = await loadFixture(deployFixture);
      const price = ethers.parseEther("0.05");
      const calls = [
        registry.interface.encodeFunctionData("registerRobot", [robotId, "go2-pro-001", "go2_pro", ZERO_ROOT]),
        registry.interface.encodeFunctionData("setCommandPrice", [robotId, price]),
        registry.interface.encodeFunctionData("setPublicCommands", [robotId, true]),
        registry.interface.encodeFunctionData("addOperator", [robotId, controller.address]),
      ];
      await registry.multicall(calls);

      const robot = await registry.getRobot(robotId);
      expect(robot.owner).to.equal(owner.address);
      expect(robot.publicCommands).to.be.true;
      expect(await registry.getCommandPrice(robotId)).to.equal(price);
      expect(await registry.isOperator(robotId, controller.address)).to.be.true;
      expect(await registry.isAuthorized(robotId, other.address)).to.be.true;
    });

    it("should check each call against the original sender", async function () {
      const { registry, other, robotId } = await loadFixture(deployFixture);
      await registry.registerRobot(robotId, "go2-pro-001", "go2_pro", ZERO_ROOT);
      const calls = [registry.interface.encodeFunctionData("setCommandPrice", [robotId, 1])];
      await expect(registry.connect(other).multicall(calls)).to.be.revertedWith("Not robot owner");
    });

    it("should apply nothing when one call fails", async function () {
      const { registry, robotId } = await loadFixture(deployFixture);
      await registry.registerRobot(robotId, "go2-pro-001", "go2_pro", ZERO_ROOT);
      const calls = [
        registry.interface.encodeFunctionData("setCommandPrice", [robotId, 1]),
        registry.interface.encodeFunctionData("addOperator", [robotId, ethers.ZeroAddress]),
      ];
      await expect(registry.multicall(calls)).to.be.revertedWith("Invalid operator");
      expect(await registry.getCommandPrice(robotId)).to.equal(0);
    });
  });

  describe("Upgrades", function () {
    it("should keep robots across an upgrade", async function () {
      const { registry, owner, robotId } = await loadFixture(deployFixture);
      await registry.registerRobot(robotId, "go2-pro-001", "go2_pro", ZERO_ROOT);
      const Registry = await ethers.getContractFactory("RobotRegistry");
      const upgraded = await upgrades.upgradeProxy(await registry.getAddress(), Registry);
      expect((await upgraded.getRobot(robotId)).owner).to.equal(owner.address);
    });

    it("should hand upgrade rights over in two steps", async function () {
      const { registry, owner, other } = await loadFixture(deployFixture);
      await registry.transferOwnership(other.address);
      expect(await registry.owner()).to.equal(owner.address);
      await registry.connect(other).acceptOwnership();
      expect(await registry.owner()).to.equal(other.address);
    });

    it("should only let the upgrade admin upgrade", async function () {
      const { registry, other } = await loadFixture(deployFixture);
      const Registry = await ethers.getContractFactory("RobotRegistry");
      const implementation = await Registry.deploy();
      await expect(
        registry.connect(other).upgradeToAndCall(await implementation.getAddress(), "0x")
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });

  describe("Authorization", function () {
    it("should authorize owner", async function () {
      const { registry, owner, robotId } = await loadFixture(deployFixture);
      await registry.registerRobot(robotId, "go2-pro-001", "go2_pro", ZERO_ROOT);
      expect(await registry.isAuthorized(robotId, owner.address)).to.be.true;
    });

    it("should not authorize random addresses", async function () {
      const { registry, other, robotId } = await loadFixture(deployFixture);
      await registry.registerRobot(robotId, "go2-pro-001", "go2_pro", ZERO_ROOT);
      expect(await registry.isAuthorized(robotId, other.address)).to.be.false;
    });

    it("should authorize anyone when public commands are enabled", async function () {
      const { registry, other, robotId } = await loadFixture(deployFixture);
      await registry.registerRobot(robotId, "go2-pro-001", "go2_pro", ZERO_ROOT);
      await expect(registry.setPublicCommands(robotId, true))
        .to.emit(registry, "PublicCommandsSet")
        .withArgs(robotId, true);
      expect((await registry.getRobot(robotId)).publicCommands).to.be.true;
      expect(await registry.isAuthorized(robotId, other.address)).to.be.true;

      await registry.setPublicCommands(robotId, false);
      expect(await registry.isAuthorized(robotId, other.address)).to.be.false;
    });

    it("should reject public commands toggle from non-owner", async function () {
      const { registry, other, robotId } = await loadFixture(deployFixture);
      await registry.registerRobot(robotId, "go2-pro-001", "go2_pro", ZERO_ROOT);
      await expect(
        registry.connect(other).setPublicCommands(robotId, true)
      ).to.be.revertedWith("Not robot owner");
    });

    it("should not authorize public senders for inactive robots", async function () {
      const { registry, other, robotId } = await loadFixture(deployFixture);
      await registry.registerRobot(robotId, "go2-pro-001", "go2_pro", ZERO_ROOT);
      await registry.setPublicCommands(robotId, true);
      await registry.updateRobot(robotId, ZERO_ROOT, false);
      expect(await registry.isAuthorized(robotId, other.address)).to.be.false;
    });

    it("should not authorize for inactive robots", async function () {
      const { registry, owner, robotId } = await loadFixture(deployFixture);
      await registry.registerRobot(robotId, "go2-pro-001", "go2_pro", ZERO_ROOT);
      await registry.updateRobot(robotId, ZERO_ROOT, false);
      expect(await registry.isAuthorized(robotId, owner.address)).to.be.false;
    });
  });

  describe("Command Price", function () {
    it("should set and get price", async function () {
      const { registry, robotId } = await loadFixture(deployFixture);
      await registry.registerRobot(robotId, "go2-pro-001", "go2_pro", ZERO_ROOT);

      const price = ethers.parseEther("0.01");
      await registry.setCommandPrice(robotId, price);
      expect(await registry.getCommandPrice(robotId)).to.equal(price);
    });
  });
});
