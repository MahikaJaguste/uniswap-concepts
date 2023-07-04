const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

let token;
let exchange;
let owner, addr1, addr2;
let addrs;

const toWei = (value) => ethers.utils.parseEther(value.toString());
const fromWei = (value) => ethers.utils.formatEther(typeof value === "string" ? value : value.toString());
const getBalance = async (address) => ethers.provider.getBalance(address);

describe("Exchange", function () {

	beforeEach(async () => {

		[owner, addr1, addr2, attacker, ...addrs] = await ethers.getSigners();

		const Token = await ethers.getContractFactory("Token");
		token = await Token.deploy("MahikaToken", "MT", toWei("100000"));
		await token.mint(attacker.address, toWei(1000));
		await token.mint(addr1.address, toWei(1000));

		const Exchange = await ethers.getContractFactory("Exchange");
		exchange = await Exchange.deploy(token.address);

		await token.approve(exchange.address, toWei("100000"));
		await token.connect(attacker).approve(exchange.address, toWei(1000));
		await exchange.addLiquidity(toWei(2000), { value: toWei(1000) });
	});

	describe("addLiquidity", async () => {

		it("LP tokens share", async () => {
			expect(await getBalance(exchange.address)).to.equal(toWei(1000));
			expect(await exchange.getReserve()).to.equal(toWei(2000));
			expect(await exchange.balanceOf(owner.address)).to.equal(toWei(1000));

			await token.connect(addr1).approve(exchange.address, toWei("100000"));
			await exchange.connect(addr1).addLiquidity(toWei(200), { value: toWei(100) });
			expect(await exchange.balanceOf(addr1.address)).to.equal(toWei(100));

			await exchange.removeLiquidity(toWei(1000));
			expect(await getBalance(exchange.address)).to.equal(toWei(100));
			expect(await exchange.getReserve()).to.equal(toWei(200));

			await exchange.connect(addr1).removeLiquidity(toWei(100));
			expect(await getBalance(exchange.address)).to.equal(toWei(0));
			expect(await exchange.getReserve()).to.equal(toWei(0));

		});
	});


	describe("getTokenAmount", async () => {
		it("returns correct token amount", async () => {
			let tokensOut = await exchange.getTokenAmount(toWei(1));
			// expect(fromWei(tokensOut)).to.equal("1.998001998001998001");
			expect(fromWei(tokensOut)).to.equal("1.978041738678708079");
		
			tokensOut = await exchange.getTokenAmount(toWei(100));
			// expect(fromWei(tokensOut)).to.equal("181.818181818181818181");
			expect(fromWei(tokensOut)).to.equal("180.1637852593266606");
		
			tokensOut = await exchange.getTokenAmount(toWei(1000));
			// expect(fromWei(tokensOut)).to.equal("1000.0");
			expect(fromWei(tokensOut)).to.equal("994.974874371859296482");
		});
	});
	  
	describe("getEthAmount", async () => {
		it("returns correct ether amount", async () => {
			let ethOut = await exchange.getEthAmount(toWei(2));
			// expect(fromWei(ethOut)).to.equal("0.999000999000999");
			expect(fromWei(ethOut)).to.equal("0.989020869339354039");
		
			ethOut = await exchange.getEthAmount(toWei(100));
			// expect(fromWei(ethOut)).to.equal("47.619047619047619047");
			expect(fromWei(ethOut)).to.equal("47.16531681753215817");
		
			ethOut = await exchange.getEthAmount(toWei(2000));
			// expect(fromWei(ethOut)).to.equal("500.0");
			expect(fromWei(ethOut)).to.equal("497.487437185929648241");
		});
	});

	describe("front-running", async () => {

		// execute a front-run attack where if user is depositing token to buy eth, you know price of eth will increase
		// so before this transaction, you buy eth worth k tokens
		// then his transaction goes through, price of eth increases
		// now you sell the above eth for > k tokens
		// thus minAmount to set limit on slippage and avoid front-run
		it("start with x tokens, end up with more than x tokens", async () => {

			console.log("Attacker has " + fromWei(await token.balanceOf(attacker.address)) + " tokens");

			const ownerEth1_original = await exchange.connect(owner).getEthAmount(toWei(100));
			console.log("Owner wanted to sell 100 tokens for " + fromWei(ownerEth1_original) + " eth");

			// attacker buys eth worth 100 tokens
			const attackerEth1 = await exchange.connect(attacker).getEthAmount(toWei(100));
			await exchange.connect(attacker).tokenToEthSwap(toWei(100), 0);
			console.log("Attacker sold 100 tokens for " + fromWei(attackerEth1) + " eth");

			// owner buys eth worth 100 tokens
			const ownerEth1 = await exchange.connect(owner).getEthAmount(toWei(100));
			await exchange.connect(owner).tokenToEthSwap(toWei(100), 0);
			console.log("Owner sold 100 tokens for " + fromWei(ownerEth1) + " eth");

			// attacker sells the eth he bought for tokens
			const attackerTokens = await exchange.connect(attacker).getTokenAmount(attackerEth1);
			await exchange.connect(attacker).ethToTokenSwap(0, { value: attackerEth1 });
			console.log("Attacker sold " + fromWei(attackerEth1) + " eth for " + fromWei(attackerTokens) + " tokens");


			console.log("Attacker has " + fromWei(await token.balanceOf(attacker.address)) + " tokens");
		});
	});


	describe("remove liquidity", async () => {

		// add liquidity
		// someone performs a swap
		// you remove liquidity - get fees + demonstrate impermanent loss
		it("remove liquidity and get fees", async () => {

			console.log("Owner had 2000 tokens and 1000 eth");

			await token.connect(addr1).approve(exchange.address, toWei("100000"));
			const ethOut = await exchange.connect(addr1).getEthAmount(toWei(100));
			console.log("Addr1 bought " + fromWei(ethOut) + " eth for 100 tokens");

			const idealEthOut = await exchange.connect(addr1).getEthAmountWithoutFees(toWei(100));
			console.log("Addr1 would have bought " + fromWei(idealEthOut) + " eth for 100 tokens without fees");

			const idealEthOut2 = await exchange.connect(addr1).getEthAmountWithoutFees(toWei(99));
			console.log("Addr1 would have bought " + fromWei(idealEthOut2) + " eth for 99 tokens without fees");

			expect(idealEthOut2).to.equal(ethOut);

			await exchange.connect(addr1).tokenToEthSwap(toWei(100), 0);
			
			const tokenAmountOld = await token.balanceOf(owner.address);
			const ethAmountOld = await getBalance(owner.address);
			await exchange.connect(owner).removeLiquidity(toWei(1000));
			const tokenAmountNew = await token.balanceOf(owner.address);
			const ethAmountNew = await getBalance(owner.address);

			const tokenAmount = tokenAmountNew.sub(tokenAmountOld);
			const ethAmount = ethAmountNew.sub(ethAmountOld);

			console.log("Owner has " + fromWei(tokenAmount) + " tokens and " + fromWei(ethAmount) + " eth");
			console.log("Owner receieved " + fromWei(toWei(100) * 0.01) + " as fees in tokens")
		});

		it("check impermanence loss", async () => {

			console.log("Owner had 2000 tokens and 1000 eth");
			console.log("Lets say 1 token = 1 USD, so 1 eth = 2 USD");
			console.log("Total worth invested = ", 2000 * 1 + 1000 * 2, " USD");

			await token.connect(addr1).approve(exchange.address, toWei("100000"));
			const ethOut = await exchange.connect(addr1).getEthAmount(toWei(100));
			await exchange.connect(addr1).tokenToEthSwap(toWei(100), 0);
			console.log("Addr1 bought " + fromWei(ethOut) + " eth for 100 tokens");

			const ethReserve = await getBalance(exchange.address);
			const tokenReserve = await token.balanceOf(exchange.address);
			const priceRatio = tokenReserve / ethReserve;
			console.log("Price ratio = " , fromWei(tokenReserve) + "/" + fromWei(ethReserve) + " = " + priceRatio);
			const newTokenPrice = 1;
			console.log("Price of token decreased to " + newTokenPrice + " USD, so price of eth increased to " + newTokenPrice * priceRatio + " USD");
			
			const tokenAmountOld = await token.balanceOf(owner.address);
			const ethAmountOld = await getBalance(owner.address);
			await exchange.connect(owner).removeLiquidity(toWei(1000));
			const tokenAmountNew = await token.balanceOf(owner.address);
			const ethAmountNew = await getBalance(owner.address);

			const tokenAmount = tokenAmountNew.sub(tokenAmountOld);
			const ethAmount = ethAmountNew.sub(ethAmountOld);

			console.log("Owner has " + fromWei(tokenAmount) + " tokens and " + fromWei(ethAmount) + " eth");
			console.log("Owner receieved " + fromWei(toWei(100) * 0.01) + " as fees in tokens");
			console.log("Total worth received back = ", ((fromWei(tokenAmount) * newTokenPrice) + (fromWei(ethAmount) * newTokenPrice * priceRatio)), " USD");
		});
	});

	describe("Concentrated liquidity", async () => {

		it("big exchange has less slippage than smaller exchange", async () => {

			const tokensOut = await exchange.getTokenAmount(toWei(100));
			expect(fromWei(tokensOut)).to.equal("180.1637852593266606");

			const Exchange = await ethers.getContractFactory("Exchange");
			const smallExchange = await Exchange.deploy(token.address);

			await token.approve(smallExchange.address, toWei("100000"));
			await token.connect(attacker).approve(smallExchange.address, toWei(1000));
			await smallExchange.addLiquidity(toWei(400), { value: toWei(200) });

			const tokensOut2 = await smallExchange.getTokenAmount(toWei(100));
			expect(fromWei(tokensOut2)).to.equal("132.441471571906354515");

			expect(tokensOut2).to.be.lte(tokensOut);

		});
	});

	// Test to demostrate impermanent loss

});
