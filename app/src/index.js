import Web3 from "web3";
import ecommerceStoreArtifact from "../../build/contracts/EcommerceStore.json";

const ipfsApi = require("ipfs-api");

let remoteIp = "127.0.0.1";
const ipfs = ipfsApi({ host: remoteIp, port: "5001", protocol: "http" });

window.getRevertReason = async function getRevertReason(txHash) {
  const tx = await web3.eth.getTransaction(txHash);

  var result = await web3.eth.call(tx, tx.blockNumber);

  result = result.startsWith("0x") ? result : `0x${result}`;

  if (result && result.substr(138)) {
    const reason = web3.utils.toAscii(result.substr(138));
    console.log("Revert reason:", reason);
    return reason;
  } else {
    console.log("Cannot get reason - No return value");
  }
};

function Utf8ArrayToStr(array) {
  var out, i, len, c;
  var char2, char3;
  out = "";
  len = array.length;
  i = 0;
  while (i < len) {
    c = array[i++];
    switch (c >> 4) {
      case 0:
      case 1:
      case 2:
      case 3:
      case 4:
      case 5:
      case 6:
      case 7:
        // 0xxxxxxx
        out += String.fromCharCode(c);
        break;
      case 12:
      case 13:
        // 110x xxxx 10xx xxxx
        char2 = array[i++];
        out += String.fromCharCode(((c & 0x1f) << 6) | (char2 & 0x3f));
        break;
      case 14:
        // 1110 xxxx 10xx xxxx 10xx xxxx
        char2 = array[i++];
        char3 = array[i++];
        out += String.fromCharCode(
          ((c & 0x0f) << 12) | ((char2 & 0x3f) << 6) | ((char3 & 0x3f) << 0)
        );
        break;
    }
  }
  return out;
}
// 添加商品图片到IPFS
function saveImageOnIpfs(reader) {
  return new Promise(function (resolve, reject) {
    const buffer = Buffer.from(reader.result);
    ipfs
      .add(buffer)
      .then((response) => {
        console.log(response);
        // HACK 不同版本的ipfs 返回的格式不一样，我这边返回的是在数组中
        resolve(response[0].path);
      })
      .catch((err) => {
        console.error(err);
        reject(err);
      });
  });
}

// 添加商品描述到IPFS
function saveTextBlobOnIpfs(blob) {
  return new Promise(function (resolve, reject) {
    const descBuffer = Buffer.from(blob, "utf-8");
    ipfs
      .add(descBuffer)
      .then((response) => {
        console.log(response);
        resolve(response[0].path);
      })
      .catch((err) => {
        console.error(err);
        reject(err);
      });
  });
}
const App = {
  web3: null,
  account: null,
  EcommerceStore: null,
  renderStore: async function () {
    const { getProduct, productIndex } = this.EcommerceStore.methods;
    var Index = await productIndex().call();
    console.log("renderStore index ", Index);
    if (Index > 0)
      for (let i = 1; i <= Index; i++) {
        var product = await getProduct(i).call();
        console.log("renderStore product ", product);
        $("#product-list").append(buildProduct(product));
      }
  },
  // 添加商品
  saveProduct: async function (reader, decodedParams) {
    saveImageOnIpfs(reader).then(function (imageId) {
      saveTextBlobOnIpfs(decodedParams["product-description"]).then(function (
        descId
      ) {
        App.saveProductToBlockchain(decodedParams, imageId, descId);
      });
    });
  },
  // 获取密文
  keccakWithamountAndsecretText: async function (amount, secretText) {
    const { keccak } = this.EcommerceStore.methods;
    amount = this.web3.utils.toWei(amount, "ether");
    var sealedBid = await keccak(amount, secretText).call();
    return sealedBid;
  },
  // 添加商品到区块链
  saveProductToBlockchain: async function (params, imageId, descId) {
    let auctionStartTime = parseInt(
      Date.parse(params["product-auction-start"]) / 1000
    );
    let auctionEndTime =
      auctionStartTime + parseInt(params["product-auction-end"]) * 24 * 60 * 60;
    const { addProductToStore } = this.EcommerceStore.methods;
    console.log(
      "addProductToStore ",
      params,
      imageId,
      descId,
      "开始时间：",
      auctionStartTime,
      "结束时间",
      auctionEndTime
    );
    await addProductToStore(
      params["product-name"],
      params["product-category"],
      imageId,
      descId,
      auctionStartTime,
      auctionEndTime,
      this.web3.utils.toWei(params["product-price"], "ether"),
      parseInt(params["product-condition"])
    )
      .send({ from: this.account })
      .then(console.log)
      .catch((err) => {
        console.log(err);
      });
    $("#msg").show();
    $("#msg").html("Your product was successfully added to your store!");
  },
  // 最终竞拍人
  highestBidder: async function (productId) {
    const { highestBidderInfo } = this.EcommerceStore.methods;
    await highestBidderInfo(productId)
      .call()
      .then((res) => {
        if (res[2].toLocaleString() == "0") {
          $("#product-status").html("Auction has ended. No bids were revealed");
        } else {
          $("#product-status").html(
            "Auction has ended. Product sold to " +
              res[0] +
              " for Ξ:" +
              this.web3.utils.fromWei(res[2], "ether") +
              "The money is in the escrow. Two of the three participants (Buyer, Seller and Arbiter) have to " +
              "either release the funds to seller or refund the money to the buyer"
          );
        }
      });
  },

  // 释放给卖家
  releaseFunds: async function (productId) {
    const { releaseAmountToSeller } = this.EcommerceStore.methods;
    await releaseAmountToSeller(productId)
      .send({ from: this.account, gas: 999999 })
      .then((res) => {
        console.log(res);
        location.reload();
      })
      .catch((err) => {
        console.log(err);
      });
  },

  // 回退给买家
  refundFunds: async function (productId) {
    const { refundAmountToBuyer } = this.EcommerceStore.methods;
    await refundAmountToBuyer(productId)
      .send({ from: this.account, gas: 999999 })
      .then((res) => {
        console.log(res);
        location.reload();
      })
      .catch((err) => {
        console.log(err);
      });
  },
  renderProductDetails: async function (productId) {
    const { getProduct } = this.EcommerceStore.methods;
    var res = await getProduct(productId).call();
    console.log("renderProductDetails product ", res);
    let descNode = $("#product-desc");

    ipfs
      .cat(res[4])
      .then((content) =>
        descNode.append("<div>" + Utf8ArrayToStr(content) + "</div>")
      );
    $("#product-image").append(
      "<img src='http://" +
        remoteIp +
        ":8080/ipfs/" +
        res[3] +
        "' width='250px' />"
    );
    $("#product-price").html(this.web3.utils.fromWei(res[7], "ether") + "ETH");
    $("#product-name").html(res[1]);
    $("#product-auction-start").html(secondToDateTime(res[5]));
    $("#product-auction-end").html(secondToDateTime(res[6]));
    let condition = res[9]; // 0 上收 1 出售中 2 已售出
    $("#revealing, #bidding, #finalize-auction, #escrow-info").hide();
    $("#product-id").val(res[0]);
    $("#product-bids-num").html(res[8]);
    $("#product-seller").html('发布人地址：');
    
    let currentTime = Math.round(new Date() / 1000);
    if (res[9] == 1) {
      // 已经开始了
      $("#escrow-info").show();
      this.highestBidder(productId);
      this.escrowData(productId);
    } else if (res[9] == 2) {
      // 已经结束了，没有售出
      $("#product-status").html("Product was not sold");
    } else if (currentTime < res[6]) {
      $("#bidding").show();
      $("#revealing").show();
    } else {
      $("#finalize-auction").show();
    }
  },
  // 出价
  bidProduct: async function (productId, sealedBid, sendAmount) {
    const { bid } = this.EcommerceStore.methods;
    await bid(productId, sealedBid)
      .send({
        value: this.web3.utils.toWei(sendAmount, "ether"),
        from: this.account,
      })
      .then((res) => {
        $("#msg").html("Your bid has been successfully submitted!");
        $("#msg").show();
      });
  },
  // 揭示报价
  revealProduct: async function (productId, amount, secretText) {
    const { revealBid } = this.EcommerceStore.methods;
    let amounts = this.web3.utils.toWei(amount, "ether");
    await revealBid(productId, amounts, secretText)
      .send({ from: this.account, gas: 999999 })
      .then((res) => {
        $("#msg").show();
        $("#msg").html("Your bid has been successfully revealed!");
        console.log(res);
      })
      .catch((e) => {
        console.log(e);
      });
  },

  // 托管
  finalizeProduct: async function (productId) {
    const { finalizeAuction } = this.EcommerceStore.methods;
    await finalizeAuction(productId)
      .send({ from: this.account, gas: 999999 })
      .then((res) => {
        $("#msg").show();
        $("#msg").html("The auction has been finalized and winner declared.");
        console.log(res);
        location.reload();
      })
      .catch((err) => {
        console.log(err);
        $("#msg").show();
        $("#msg").html(
          "The auction can not be finalized by the buyer or seller, only a third party aribiter can finalize it"
        );
      });
  },
  // 托管合约信息
  escrowData: async function (productId) {
    const { escrowInfo } = this.EcommerceStore.methods;
    await escrowInfo(productId)
      .call()
      .then((res) => {
        $("#buyer").html("Buyer: " + res[0]);
        $("#seller").html("Seller: " + res[1]);
        $("#arbiter").html("Arbiter: " + res[2]);
        if (res[3] == true) {
          $("#release-count").html("Amount from the escrow has been released");
        } else {
          $("#release-count").html(
            res[4] + " of 3 participants have agreed to release funds"
          );
          $("#refund-count").html(
            res[5] + " of 3 participants have agreed to refund the buyer"
          );
        }
      });
  },

  start: async function () {
    const { web3 } = this;

    try {
      // get contract instance
      const networkId = await web3.eth.net.getId();
      const deployedNetwork = ecommerceStoreArtifact.networks[networkId];
      this.EcommerceStore = new web3.eth.Contract(
        ecommerceStoreArtifact.abi,
        deployedNetwork.address
      );

      // get accounts
      const accounts = await web3.eth.getAccounts();
      this.account = accounts[0];
      $("#current-account").html("当前账号地址：" + this.account);
      console.log("account ", accounts, this.account);
    } catch (error) {
      console.error("Could not connect to contract or chain.");
    }
    // 判断是详情页还是首页
    if ($("#product-details").length > 0) {
      //This is product details page
      let productId = new URLSearchParams(window.location.search).get(
        "product-id"
      );
      console.log("productId ", productId);
      $("#revealing, #bidding").hide();
      this.renderProductDetails(productId);
    } else if ($("#product-list").length > 0) {
      this.renderStore();
    }
  },
};

function secondToDateTime(timeScond) {
  return new Date(timeScond * 1000).toLocaleString();
}

// 商品列表样式
function buildProduct(product) {
  let node = $("<div/>");
  node.addClass("col-sm-3 text-center col-margin-bottom-1");
  // 这里是ipfs 的 gateway 网关地址
  node.append(
    "<a href='product.html?product-id=" +
      product[0] +
      "'><img src='http://" +
      remoteIp +
      ":8080/ipfs/" +
      product[3] +
      "' width='150px' height='100px' /></a>"
  );
  node.append("<div><span>商品名：</span>" + product[1] + "</div>");
  node.append("<div><span>商品分类：</span>" + product[2] + "</div>");
  node.append(
    "<div><span>开始时间：</span>" + secondToDateTime(product[5]) + "</div>"
  );
  node.append(
    "<div><span>结束时间：</span>" + secondToDateTime(product[6]) + "</div>"
  );
  node.append(
    "<div>Ether " + App.web3.utils.fromWei(product[7], "ether") + "</div>"
  );
  return node;
}
window.App = App;

window.addEventListener("load", function () {
  if (window.ethereum) {
    // use MetaMask's provider
    App.web3 = new Web3(window.ethereum);
    window.ethereum.enable(); // get permission to access accounts
  } else {
    console.warn(
      "No web3 detected. Falling back to   You should remove this fallback when you deploy live"
    );
    // fallback - use your fallback strategy (local node / hosted node + in-dapp id mgmt / fail)
    App.web3 = new Web3(
      new Web3.providers.HttpProvider(`http://127.0.0.1:8545`)
    );
  }
  var reader;
  // 照片选择
  $("#product-image").change(function (event) {
    const file = event.target.files[0];
    reader = new window.FileReader();
    reader.readAsArrayBuffer(file);
  });

  $("#back-home").click(function () {
    window.location.href = "/";
  });

  // 出价
  $("#bidding").submit(function (event) {
    $("#msg").hide();
    let amount = $("#bid-amount").val().toString();
    let sendAmount = $("#bid-send-amount").val().toString();
    let secretText = $("#secret-text").val().toString();
    let productId = $("#product-id").val();
    let sealedBid = App.keccakWithamountAndsecretText(amount, secretText);
    sealedBid.then((sealedBid) => {
      App.bidProduct(productId, sealedBid, sendAmount);
    });
    event.preventDefault();
    return false;
  });
  // 揭示报价
  $("#revealing").submit(function (event) {
    $("#msg").hide();
    let amount = $("#actual-amount").val().toString();
    let secretText = $("#reveal-secret-text").val().toString();
    let productId = $("#product-id").val();
    App.revealProduct(productId, amount, secretText);
    event.preventDefault();
  });

  // 托管
  $("#finalize-auction").submit(function (event) {
    $("#msg").hide();
    let productId = $("#product-id").val();
    App.finalizeProduct(productId);
    event.preventDefault();
  });

  // 释放给卖家
  $("#release-funds").click(function () {
    let productId = new URLSearchParams(window.location.search).get(
      "product-id"
    );
    $("#msg")
      .html(
        "Your transaction has been submitted. Please wait for few seconds for the confirmation"
      )
      .show();
    App.releaseFunds(productId);
  });

  // 回退给买家
  $("#refund-funds").click(function () {
    let productId = new URLSearchParams(window.location.search).get(
      "product-id"
    );
    $("#msg")
      .html(
        "Your transaction has been submitted. Please wait for few seconds for the confirmation"
      )
      .show();
    App.refundFunds(productId);
    alert("refund the funds!");
  });

  // 添加商品表单提交
  $("#add-item-to-store").submit(function (event) {
    const req = $("#add-item-to-store").serialize();
    let params = JSON.parse(
      '{"' +
        req.replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g, '":"') +
        '"}'
    );
    console.log(req, "params ", params);
    let decodedParams = {};
    Object.keys(params).forEach(function (v) {
      decodedParams[v] = decodeURIComponent(decodeURI(params[v]));
    });
    App.saveProduct(reader, decodedParams);
    event.preventDefault();
    return false;
  });

  App.start();
});
