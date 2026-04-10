import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // Deploy Registry
  const Registry = await ethers.getContractFactory("RobotRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("RobotRegistry deployed to:", registryAddress);

  // Deploy Dispatcher
  const Dispatcher = await ethers.getContractFactory("RobotCommandDispatcher");
  const dispatcher = await Dispatcher.deploy(registryAddress);
  await dispatcher.waitForDeployment();
  const dispatcherAddress = await dispatcher.getAddress();
  console.log("RobotCommandDispatcher deployed to:", dispatcherAddress);

  console.log("\nAdd these to your .env:");
  console.log(`REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`DISPATCHER_ADDRESS=${dispatcherAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
