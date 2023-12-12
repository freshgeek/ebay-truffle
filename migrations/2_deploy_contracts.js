const EcommerceStore = artifacts.require("EcommerceStore");

module.exports = function (deployer) {
  deployer.deploy(EcommerceStore);
  // truffle deploy 
  // truffle console
  
  // 预先定义变量，添加商品，查询商品
  // amt_1 = web3.utils.toWei('1','ether')
  // current_second = Math.round(new Date()/1000) // 这个在我的版本中无效，为固定时间
  // current_second = function(){return Math.round(new Date()/1000);}
  // EcommerceStore.deployed().then(function (instance) {instance.addProductToStore("cciPhone6","Cell Phone","_imageLink", "Description 1",current_second(),current_second()+300,amt_1,0).then(r=>console.log(r))});
  // EcommerceStore.deployed().then(function (instance) {instance.getProduct(3).then(console.log)});

  // 竞价
  // payable 编译报错，解决方式：solidity版本问题，别选太高，好像是6.8 解决
  //   compilers: {
    // solc: {
    //   version: "^0.6.8",
    // 竞价 
    // amt_1 = web3.utils.toWei('1','ether')
    // sha3 =function(amount,secret){return web3.utils.keccak256(amount+secret);} 
  // EcommerceStore.deployed().then(function (instance) {instance.bid(3,sha3(amt_1,'cc')).then(res=>console.log(res))});
};
