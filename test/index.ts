import { Signer } from "@ethersproject/abstract-signer";
import chai, { expect } from "chai";
import { ethers } from "hardhat";
import { ERC20, TokenTimelock } from "../typechain";
import moment, { Moment, duration } from "moment";
import chaiAsPromised from "chai-as-promised";

chai.use(chaiAsPromised);

async function mineBlockAtTimestamp(time: Moment): Promise<void> {
  await ethers.provider.send("evm_setNextBlockTimestamp", [time.unix()]);
  await ethers.provider.send("evm_mine", []);
}

describe("TokenTimelock", function () {
  const totalSupply = "1000000000";
  const lockupAmount = "25";

  let erc20Minter: Signer;
  let lockupCreator: Signer;
  let originalBeneficiary: Signer;
  let newBeneficiary: Signer;
  let uninvolvedThirdParty: Signer;
  let erc20: ERC20;

  let tokenTimelock: TokenTimelock;

  const lockupDuration = duration(2, "years");
  let lockupReleaseTime: Moment;

  beforeEach("deploy ERC20 contract", async function () {
    const signers = await ethers.getSigners();
    expect(signers).to.have.length.greaterThanOrEqual(5);
    [
      erc20Minter,
      lockupCreator,
      originalBeneficiary,
      newBeneficiary,
      uninvolvedThirdParty,
    ] = signers;
    const Erc20Factory = await ethers.getContractFactory(
      "ERC20PresetFixedSupply"
    );
    erc20 = await Erc20Factory.deploy(
      "test ERC20",
      "TEST",
      totalSupply,
      await erc20Minter.getAddress()
    );
    await erc20.deployed();
  });

  beforeEach("fund the lockup creator", async function () {
    await erc20
      .connect(erc20Minter)
      .transfer(await lockupCreator.getAddress(), lockupAmount);
  });

  beforeEach("deploy tokenTimelock", async function () {
    const latestBlock = await ethers.provider.getBlock("latest");
    const currentTime = moment.unix(latestBlock.timestamp);
    lockupReleaseTime = currentTime.clone().add(lockupDuration);

    const tokenTimelockFactory = await ethers.getContractFactory(
      "TokenTimelock"
    );
    tokenTimelock = await tokenTimelockFactory.deploy(
      erc20.address,
      await originalBeneficiary.getAddress(),
      lockupReleaseTime.unix()
    );
    await tokenTimelock.deployed();

    await erc20
      .connect(lockupCreator)
      .transfer(tokenTimelock.address, lockupAmount);
  });

  it("should not allow beneficiary to redeem before lockup expired", async function () {
    const timestampBeforeLockupExpired = lockupReleaseTime
      .clone()
      .subtract(duration(10, "days"));
    await mineBlockAtTimestamp(timestampBeforeLockupExpired);
    const releaseCall = tokenTimelock.connect(originalBeneficiary).release();
    await expect(releaseCall).to.be.rejectedWith(
      "current time is before release time"
    );
  });

  it("should allow beneficiary to redeem after lockup expired", async function () {
    const timestampAfterLockupExpired = lockupReleaseTime
      .clone()
      .add(duration(10, "days"));
    await mineBlockAtTimestamp(timestampAfterLockupExpired);
    await tokenTimelock.connect(originalBeneficiary).release();

    const beneficiaryBalance = await erc20.balanceOf(
      await originalBeneficiary.getAddress()
    );
    expect(beneficiaryBalance.toString()).to.equal(lockupAmount);
  });

  it("should allow a third party to trigger release to beneficiary", async function () {
    const timestampAfterLockupExpired = lockupReleaseTime
      .clone()
      .add(duration(10, "days"));
    await mineBlockAtTimestamp(timestampAfterLockupExpired);
    await tokenTimelock.connect(uninvolvedThirdParty).release();
    const beneficiaryBalance = await erc20.balanceOf(
      await originalBeneficiary.getAddress()
    );
    expect(beneficiaryBalance.toString()).to.equal(lockupAmount);
  });

  it("should allow current beneficiary to set new beneficiary", async function () {
    await tokenTimelock
      .connect(originalBeneficiary)
      .setBeneficiary(await newBeneficiary.getAddress());
    const observedBeneficiary = await tokenTimelock.beneficiary();
    expect(observedBeneficiary).to.equal(await newBeneficiary.getAddress());
  });

  it("should release tokens to the latest beneficiary", async function () {
    await tokenTimelock
      .connect(originalBeneficiary)
      .setBeneficiary(await newBeneficiary.getAddress());

    const timestampAfterLockupExpired = lockupReleaseTime
      .clone()
      .add(duration(10, "days"));
    await mineBlockAtTimestamp(timestampAfterLockupExpired);
    await tokenTimelock.connect(newBeneficiary).release();
    const beneficiaryBalance = await erc20.balanceOf(
      await newBeneficiary.getAddress()
    );
    expect(beneficiaryBalance.toString()).to.equal(lockupAmount);
  });

  it("should not allow uninvolved third-party to set themselves as the beneficiary", async function () {
    const setBeneficiaryCall = tokenTimelock
      .connect(uninvolvedThirdParty)
      .setBeneficiary(await uninvolvedThirdParty.getAddress());
    await expect(setBeneficiaryCall).to.be.rejected;
    const observedBeneficiary = await tokenTimelock.beneficiary();
    expect(observedBeneficiary).to.equal(
      await originalBeneficiary.getAddress()
    );
  });
});
