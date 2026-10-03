import { ethers, upgrades } from "hardhat";

/**
 * Deploys both contracts behind UUPS proxies. The deployer becomes the
 * upgrade admin of both; hand that to a timelock or multisig later with
 * `transferOwnership`. The proxy addresses are the ones apps use. The
 * plugin records the deployment in .openzeppelin/, which `upgrade.ts`
 * needs to check storage layouts, so commit it.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const Registry = await ethers.getContractFactory("RobotRegistry");
  const registry = await upgrades.deployProxy(Registry, [deployer.address], { kind: "uups" });
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("RobotRegistry proxy:", registryAddress);
  console.log("  implementation:", await upgrades.erc1967.getImplementationAddress(registryAddress));

  const Dispatcher = await ethers.getContractFactory("RobotCommandDispatcher");
  const dispatcher = await upgrades.deployProxy(Dispatcher, [registryAddress, deployer.address], {
    kind: "uups",
  });
  await dispatcher.waitForDeployment();
  const dispatcherAddress = await dispatcher.getAddress();
  console.log("RobotCommandDispatcher proxy:", dispatcherAddress);
  console.log("  implementation:", await upgrades.erc1967.getImplementationAddress(dispatcherAddress));

  console.log("\nAdd these to your .env:");
  console.log(`REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`DISPATCHER_ADDRESS=${dispatcherAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
