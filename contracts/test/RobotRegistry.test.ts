import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("RobotRegistry", function () {
  async function deployFixture() {
    const [owner, controller, other] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("RobotRegistry");
    const registry = await Registry.deploy();
    const robotId = ethers.keccak256(ethers.toUtf8Bytes("go2-pro-001"));
    return { registry, owner, controller, other, robotId };
  }

  describe("Registration", function () {
    it("should register a robot", async function () {
      const { registry, owner, robotId } = await loadFixture(deployFixture);

      await expect(
        registry.registerRobot(robotId, "go2_pro", "ipfs://metadata")
      )
        .to.emit(registry, "RobotRegistered")
        .withArgs(robotId, owner.address, "go2_pro");

      const robot = await registry.getRobot(robotId);
      expect(robot.owner).to.equal(owner.address);
      expect(robot.robotType).to.equal("go2_pro");
      expect(robot.active).to.be.true;
    });

    it("should reject duplicate registration", async function () {
      const { registry, robotId } = await loadFixture(deployFixture);
      await registry.registerRobot(robotId, "go2_pro", "");
      await expect(
        registry.registerRobot(robotId, "go2_pro", "")
      ).to.be.revertedWith("Robot already registered");
    });
  });

  describe("Update", function () {
    it("should allow owner to update", async function () {
      const { registry, robotId } = await loadFixture(deployFixture);
      await registry.registerRobot(robotId, "go2_pro", "");

      await expect(registry.updateRobot(robotId, "ipfs://new", false))
        .to.emit(registry, "RobotUpdated")
        .withArgs(robotId);

      const robot = await registry.getRobot(robotId);
      expect(robot.metadataURI).to.equal("ipfs://new");
      expect(robot.active).to.be.false;
    });

    it("should reject non-owner update", async function () {
      const { registry, other, robotId } = await loadFixture(deployFixture);
      await registry.registerRobot(robotId, "go2_pro", "");
      await expect(
        registry.connect(other).updateRobot(robotId, "", true)
      ).to.be.revertedWith("Not robot owner");
    });
  });

  describe("Controller Management", function () {
    it("should add and remove controllers", async function () {
      const { registry, controller, robotId } =
        await loadFixture(deployFixture);
      await registry.registerRobot(robotId, "go2_pro", "");

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

  describe("Authorization", function () {
    it("should authorize owner", async function () {
      const { registry, owner, robotId } = await loadFixture(deployFixture);
      await registry.registerRobot(robotId, "go2_pro", "");
      expect(await registry.isAuthorized(robotId, owner.address)).to.be.true;
    });

    it("should not authorize random addresses", async function () {
      const { registry, other, robotId } = await loadFixture(deployFixture);
      await registry.registerRobot(robotId, "go2_pro", "");
      expect(await registry.isAuthorized(robotId, other.address)).to.be.false;
    });

    it("should not authorize for inactive robots", async function () {
      const { registry, owner, robotId } = await loadFixture(deployFixture);
      await registry.registerRobot(robotId, "go2_pro", "");
      await registry.updateRobot(robotId, "", false);
      expect(await registry.isAuthorized(robotId, owner.address)).to.be.false;
    });
  });

  describe("Command Price", function () {
    it("should set and get price", async function () {
      const { registry, robotId } = await loadFixture(deployFixture);
      await registry.registerRobot(robotId, "go2_pro", "");

      const price = ethers.parseEther("0.01");
      await registry.setCommandPrice(robotId, price);
      expect(await registry.getCommandPrice(robotId)).to.equal(price);
    });
  });
});
