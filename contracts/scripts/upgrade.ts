import { ethers, upgrades } from "hardhat";

/**
 * Upgrades both proxies at REGISTRY_ADDRESS and DISPATCHER_ADDRESS to the
 * compiled contracts. The plugin refuses a storage layout that would
 * corrupt existing state, using the record in .openzeppelin/. Must be run
 * by the upgrade admin (DEPLOYER_PRIVATE_KEY). Once a timelock owns the
 * proxies, use `upgrades.prepareUpgrade` here instead and schedule the
 * `upgradeToAndCall` through the timelock.
 */
async function main() {
  const { REGISTRY_ADDRESS, DISPATCHER_ADDRESS } = process.env;
  if (!REGISTRY_ADDRESS || !DISPATCHER_ADDRESS) throw new Error("Set REGISTRY_ADDRESS and DISPATCHER_ADDRESS");

  for (const [name, address] of [
    ["RobotRegistry", REGISTRY_ADDRESS],
    ["RobotCommandDispatcher", DISPATCHER_ADDRESS],
  ]) {
    const upgraded = await upgrades.upgradeProxy(address, await ethers.getContractFactory(name));
    await upgraded.waitForDeployment();
    console.log(`${name} at ${address} now runs`, await upgrades.erc1967.getImplementationAddress(address));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
