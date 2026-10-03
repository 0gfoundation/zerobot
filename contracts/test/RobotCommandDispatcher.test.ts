import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("RobotCommandDispatcher", function () {
  async function deployFixture() {
    const [owner, controller, other] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory("RobotRegistry");
    const registry = await Registry.deploy();

    const Dispatcher = await ethers.getContractFactory(
      "RobotCommandDispatcher"
    );
    const dispatcher = await Dispatcher.deploy(await registry.getAddress());

    const robotId = ethers.keccak256(ethers.toUtf8Bytes("go2-pro-001"));

    // Register robot and add controller
    await registry.registerRobot(robotId, "go2-pro-001", "go2_pro", ethers.ZeroHash);
    await registry.addController(robotId, controller.address);

    return { registry, dispatcher, owner, controller, other, robotId };
  }

  describe("Dispatch", function () {
    it("should dispatch a command from owner", async function () {
      const { dispatcher, owner, robotId } = await loadFixture(deployFixture);

      await expect(
        dispatcher.dispatchCommand(
          robotId,
          1016, // Hello
          "",
          "Ada"
        )
      )
        .to.emit(dispatcher, "CommandDispatched")
        .withArgs(robotId, 0, owner.address, 1016, "", "Ada", 0);

      const cmd = await dispatcher.getCommand(robotId, 0);
      expect(cmd.apiId).to.equal(1016);
      expect(cmd.sender).to.equal(owner.address);
      expect(cmd.note).to.equal("Ada");
      expect(cmd.status).to.equal(0); // Pending
    });

    it("should dispatch from authorized controller", async function () {
      const { dispatcher, controller, robotId } =
        await loadFixture(deployFixture);

      await expect(
        dispatcher
          .connect(controller)
          .dispatchCommand(robotId, 1008, '{"x":0.5,"y":0,"z":0}', "")
      )
        .to.emit(dispatcher, "CommandDispatched")
        .withArgs(
          robotId,
          0,
          controller.address,
          1008,
          '{"x":0.5,"y":0,"z":0}',
          "",
          0
        );
    });

    it("should reject unauthorized sender", async function () {
      const { dispatcher, other, robotId } =
        await loadFixture(deployFixture);
      await expect(
        dispatcher.connect(other).dispatchCommand(robotId, 1016, "", "")
      ).to.be.revertedWith("Not authorized");
    });

    it("should increment nonce", async function () {
      const { dispatcher, robotId } = await loadFixture(deployFixture);
      await dispatcher.dispatchCommand(robotId, 1004, "", "");
      await dispatcher.dispatchCommand(robotId, 1016, "", "");

      expect(await dispatcher.getRobotNonce(robotId)).to.equal(2);

      const cmd0 = await dispatcher.getCommand(robotId, 0);
      const cmd1 = await dispatcher.getCommand(robotId, 1);
      expect(cmd0.apiId).to.equal(1004);
      expect(cmd1.apiId).to.equal(1016);
    });
  });

  describe("Public commands", function () {
    it("should let anyone dispatch once the owner opens the robot", async function () {
      const { registry, dispatcher, other, robotId } =
        await loadFixture(deployFixture);
      await registry.setPublicCommands(robotId, true);

      await expect(
        dispatcher.connect(other).dispatchCommand(robotId, 1016, "", "Grace")
      )
        .to.emit(dispatcher, "CommandDispatched")
        .withArgs(robotId, 0, other.address, 1016, "", "Grace", 0);
    });

    it("should still charge the price to public senders", async function () {
      const { registry, dispatcher, other, robotId } =
        await loadFixture(deployFixture);
      const price = ethers.parseEther("0.01");
      await registry.setPublicCommands(robotId, true);
      await registry.setCommandPrice(robotId, price);

      await expect(
        dispatcher.connect(other).dispatchCommand(robotId, 1016, "", "Grace")
      ).to.be.revertedWith("Insufficient payment");
      await expect(
        dispatcher
          .connect(other)
          .dispatchCommand(robotId, 1016, "", "Grace", { value: price })
      ).to.emit(dispatcher, "CommandDispatched");
    });
  });

  describe("Note", function () {
    it("should reject notes over 64 bytes", async function () {
      const { dispatcher, robotId } = await loadFixture(deployFixture);
      await expect(dispatcher.dispatchCommand(robotId, 1016, "", "a".repeat(64)))
        .to.emit(dispatcher, "CommandDispatched");
      await expect(
        dispatcher.dispatchCommand(robotId, 1016, "", "a".repeat(65))
      ).to.be.revertedWith("Note too long");
      await expect(
        dispatcher.dispatchBatch(robotId, [1016], [""], "a".repeat(65))
      ).to.be.revertedWith("Note too long");
    });
  });

  describe("Payment", function () {
    it("should require payment when price is set", async function () {
      const { registry, dispatcher, controller, robotId } =
        await loadFixture(deployFixture);
      const price = ethers.parseEther("0.01");
      await registry.setCommandPrice(robotId, price);

      await expect(
        dispatcher.connect(controller).dispatchCommand(robotId, 1016, "", "")
      ).to.be.revertedWith("Insufficient payment");

      await expect(
        dispatcher
          .connect(controller)
          .dispatchCommand(robotId, 1016, "", "", { value: price })
      ).to.emit(dispatcher, "CommandDispatched");
    });

    it("should allow owner to withdraw balance", async function () {
      const { registry, dispatcher, controller, owner, robotId } =
        await loadFixture(deployFixture);
      const price = ethers.parseEther("0.01");
      await registry.setCommandPrice(robotId, price);

      // Send 3 commands
      await dispatcher
        .connect(controller)
        .dispatchCommand(robotId, 1016, "", "", { value: price });
      await dispatcher
        .connect(controller)
        .dispatchCommand(robotId, 1017, "", "", { value: price });
      await dispatcher
        .connect(controller)
        .dispatchCommand(robotId, 1004, "", "", { value: price });

      const expectedBalance = price * 3n;

      await expect(dispatcher.withdrawBalance(robotId))
        .to.emit(dispatcher, "BalanceWithdrawn")
        .withArgs(robotId, owner.address, expectedBalance);
    });

    it("should reject withdrawal from non-owner", async function () {
      const { dispatcher, other, robotId } =
        await loadFixture(deployFixture);
      await expect(
        dispatcher.connect(other).withdrawBalance(robotId)
      ).to.be.revertedWith("Only robot owner can withdraw");
    });
  });

  describe("Batch Dispatch", function () {
    it("should dispatch multiple commands", async function () {
      const { dispatcher, robotId } = await loadFixture(deployFixture);

      await dispatcher.dispatchBatch(
        robotId,
        [1004, 1016, 1008],
        ["", "", '{"x":0.3,"y":0,"z":0}'],
        "Ada"
      );

      expect(await dispatcher.getRobotNonce(robotId)).to.equal(3);
      expect((await dispatcher.getCommand(robotId, 2)).note).to.equal("Ada");
    });

    it("should require total payment for batch", async function () {
      const { registry, dispatcher, controller, robotId } =
        await loadFixture(deployFixture);
      const price = ethers.parseEther("0.01");
      await registry.setCommandPrice(robotId, price);

      await expect(
        dispatcher
          .connect(controller)
          .dispatchBatch(robotId, [1004, 1016], ["", ""], "", {
            value: price,
          })
      ).to.be.revertedWith("Insufficient payment");

      await expect(
        dispatcher
          .connect(controller)
          .dispatchBatch(robotId, [1004, 1016], ["", ""], "", {
            value: price * 2n,
          })
      ).to.emit(dispatcher, "CommandDispatched");
    });
  });

  describe("Receipts", function () {
    it("should allow owner to submit receipt", async function () {
      const { dispatcher, robotId } = await loadFixture(deployFixture);
      await dispatcher.dispatchCommand(robotId, 1016, "", "");

      await expect(dispatcher.submitReceipt(robotId, 0, true, "ok"))
        .to.emit(dispatcher, "CommandExecuted")
        .withArgs(robotId, 0, true, "ok");

      const cmd = await dispatcher.getCommand(robotId, 0);
      expect(cmd.status).to.equal(1); // Executed
    });

    it("should reject duplicate receipt", async function () {
      const { dispatcher, robotId } = await loadFixture(deployFixture);
      await dispatcher.dispatchCommand(robotId, 1016, "", "");
      await dispatcher.submitReceipt(robotId, 0, true, "ok");

      await expect(
        dispatcher.submitReceipt(robotId, 0, true, "ok")
      ).to.be.revertedWith("Command already processed");
    });

    it("should reject receipt from non-owner", async function () {
      const { dispatcher, controller, robotId } =
        await loadFixture(deployFixture);
      await dispatcher.dispatchCommand(robotId, 1016, "", "");

      await expect(
        dispatcher.connect(controller).submitReceipt(robotId, 0, true, "ok")
      ).to.be.revertedWith("Only robot owner can submit receipts");
    });
  });

  describe("Get Pending Commands", function () {
    it("should return only pending commands", async function () {
      const { dispatcher, robotId } = await loadFixture(deployFixture);

      await dispatcher.dispatchCommand(robotId, 1004, "", "");
      await dispatcher.dispatchCommand(robotId, 1016, "", "");
      await dispatcher.dispatchCommand(robotId, 1008, '{"x":0.3}', "");

      // Mark first as executed
      await dispatcher.submitReceipt(robotId, 0, true, "");

      const pending = await dispatcher.getPendingCommands(robotId, 0, 10);
      expect(pending.length).to.equal(2);
      expect(pending[0].apiId).to.equal(1016);
      expect(pending[1].apiId).to.equal(1008);
    });
  });
});
