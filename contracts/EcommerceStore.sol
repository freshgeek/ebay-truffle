pragma solidity >=0.4.21;

import "./Escrow.sol";

contract EcommerceStore {
    // 可以竞价、已售出、未售出
    enum ProductStatus {
        Open,
        Sold,
        Unsold
    }

    // 0新品、1旧品
    enum ProductCondition {
        New,
        Used
    }

    // 产品id 计数器
    uint public productIndex;

    // 产品id对应 创建者用户的映射
    mapping(uint => address) productIdInStore;

    // 创建者用户对应 productIdInStore 的映射
    mapping(address => mapping(uint => Product)) stores;

    // 创建合约映射
    mapping(uint => address) productEscrow;
    // 商品结构体
    struct Product {
        // 商品id
        uint id;
        // 商品名
        string name;
        // 商品分类
        string category;
        // 商品图片链接
        string imageLink;
        // 商品描述链接
        string descLink;
        //  商品竞拍开始时间 秒时间戳
        uint auctionStartTime;
        // 商品竞拍结束时间 秒时间戳
        uint auctionEndTime;
        // 商品起拍价格 单位：wei
        uint startPrice;
        // 商品最高出价者
        address highestBidder;
        // 最高出价价格 单位：wei
        uint highestBid;
        // 第二高价格 单位：wei
        uint secondHighestBid;
        // 总出价数
        uint totalBids;
        // 商品状态
        ProductStatus status;
        // 商品新旧
        ProductCondition condition;
        // 竞拍人映射
        mapping(address => mapping(bytes32 => Bid)) bids;
    }

    struct Bid {
        // 竞拍人
        address bidder;
        // 商品id
        uint productId;
        // 押金数量以太
        uint value;
        // 是否揭露
        bool revealed;
    }

    function bid(uint _productId, bytes32 _bid) public payable returns (bool) {
        // 竞拍逻辑
        Product storage product = stores[productIdInStore[_productId]][
            _productId
        ];
        require(
            block.timestamp >= product.auctionStartTime,
            "need to start auction"
        );
        require(
            block.timestamp <= product.auctionEndTime,
            "need to end auction"
        );
        require(msg.value >= product.startPrice, "need to pay start price");
        require(
            product.bids[msg.sender][_bid].bidder == address(0),
            "need to bid"
        );
        require(product.status == ProductStatus.Open);

        // 维护bid 映射
        product.bids[msg.sender][_bid] = Bid(
            msg.sender,
            _productId,
            msg.value,
            false
        );
        product.totalBids += 1;
        return true;
    }

    function revealBid(
        uint _productId,
        string memory _amount,
        string memory _secret
    ) public {
        // 竞拍揭露逻辑
        // 从存储库中获取产品
        Product storage product = stores[productIdInStore[_productId]][
            _productId
        ];
        // 确保竞拍已经开始
        require(product.status == ProductStatus.Open);
        require(block.timestamp >= product.auctionStartTime);
        // 创建一个密封的出价，使用当前的出价金额和秘密值

        bytes32 sealedBid = keccak(_amount, _secret);
        // 从产品中获取存储在内存中的出价信息
        Bid memory bidInfo = product.bids[msg.sender][sealedBid];
        // 确保人已经出价
        require(bidInfo.bidder != address(0),"Bidder not found");
        // 确保出价尚未揭露
        require(bidInfo.revealed == false);
        // 传入的以太数量
        uint amount = stringToUint(_amount);
        // 退款金额
        uint refund = bidInfo.value;
        // 如果出价高于当前出价金额
        // if (amount > bidInfo.value) {
        //     // 直接拿到当前出价金额，避免退款金额超过
        //     refund = bidInfo.value;
        // } else {
        // 如果当前最高出价者地址为空,没有最高出价人
        if (address(product.highestBidder) == address(0)) {
            // 将当前出价者设置为最高出价者，将出价金额设置为当前出价金额
            product.highestBidder = msg.sender;
            product.highestBid = amount;
            product.secondHighestBid = product.startPrice;
            // 计算需要退款的金额
            refund = bidInfo.value - amount;
        } else {
            // 如果当前出价高于最高出价
            if (amount > product.highestBid) {
                // 将次高出价设为当前最高出价，将最高出价设为当前出价金额，
                // 将最高出价者设为当前出价者
                product.secondHighestBid = product.highestBid;
                // 将之前最高出价者的余额转账给该地址，将最高出价设为当前出价金额，将最高出价者设为当前出价者
                payable(product.highestBidder).transfer(product.highestBid);
                product.highestBid = amount;
                product.highestBidder = msg.sender;
                refund = bidInfo.value - amount;
            } else if (amount > product.secondHighestBid) {
                // 将次高出价设为当前出价金额，将需要退款的金额设为当前出价金额
                product.secondHighestBid = amount;
            }
        }
        // }
        // 将出价揭露标记设为true
        product.bids[msg.sender][sealedBid].revealed = true;
        // 如果需要退款的金额大于0，将余额转账给当前出价者
        if (refund > 0) {
            payable(msg.sender).transfer(refund);
        }
    }

    function stringToUint(string memory _amount) private pure returns (uint) {
        bytes memory b = bytes(_amount);
        uint result = 0;
        for (uint i = 0; i < b.length; i++) {
            uint c = uint(uint8(b[i]));
            if (c >= 48 && c <= 57) {
                result = result * 10 + (c - 48);
            }
        }
        return result;
    }

    function highestBidderInfo(
        uint _productId
    ) public view returns (address, uint, uint) {
        Product storage product = stores[productIdInStore[_productId]][
            _productId
        ];
        return (
            product.highestBidder,
            product.highestBid,
            product.secondHighestBid
        );
    }

    constructor() public {
        productIndex = 0;
    }

    // 添加商品
    function addProductToStore(
        string memory _name,
        string memory _category,
        string memory _imageLink,
        string memory _descLink,
        uint _auctionStartTime,
        uint _auctionEndTime,
        uint _startPrice,
        uint _condition
    ) public {
        // 商品id
        productIndex++;
        // 开始时间需要小于结束时间
        require(_auctionStartTime < _auctionEndTime);
        // 商品状态
        require(_condition == 0 || _condition == 1);
        // 单位：wei
        require(_startPrice > 0);
        // 存入商家发布的商品映射
        stores[msg.sender][productIndex] = Product(
            productIndex,
            _name,
            _category,
            _imageLink,
            _descLink,
            _auctionStartTime,
            _auctionEndTime,
            _startPrice,
            address(0),
            0,
            0,
            0,
            ProductStatus.Open,
            ProductCondition(_condition)
        );
        // 商品id 与 商家映射
        productIdInStore[productIndex] = msg.sender;
    }

    // 平台方来结束
    function finalizeAuction(uint _productId) public {
        address seller = productIdInStore[_productId];
        // HACK 暂时不考虑有人bid 了 但是不揭示的情况
        Product storage product = stores[seller][_productId];
        require(
            product.auctionEndTime + 60 <= block.timestamp,
            "must gater auction end time 60 seconds "
        );
        require(product.status == ProductStatus.Open, "product must be open ");
        require(msg.sender != seller, "Caller must not be seller");

        require(
            msg.sender != product.highestBidder,
            "Caller must not be bidder"
        );

        if (product.totalBids == 0) {
            product.status = ProductStatus.Unsold;
        } else {
            // 创建托管合约
            Escrow escrow = (new Escrow).value(product.secondHighestBid)(
                _productId,
                product.highestBidder,
                seller,
                msg.sender
            );
            productEscrow[_productId] = address(escrow);
            product.status = ProductStatus.Sold;
            uint refund = product.highestBid - product.secondHighestBid;
            if (refund > 0) {
                payable(product.highestBidder).transfer(refund);
            }
        }
    }

    function releaseAmountToSeller(uint _productId) public {
        Escrow(productEscrow[_productId]).releaseAmountToSeller(msg.sender);
    }

    function refundAmountToBuyer(uint _productId) public {
        Escrow(productEscrow[_productId]).refundAmountToBuyer(msg.sender);
    }

    function escrowAddressForProduct(
        uint _productId
    ) public view returns (address) {
        return productEscrow[_productId];
    }

    function escrowInfo(
        uint256 _productId
    ) public view returns (address, address, address, bool, uint256, uint256) {
        return Escrow(productEscrow[_productId]).escrowInfo();
    }

    function getProduct(
        uint _productId
    )
        public
        view
        returns (
            uint,
            string memory,
            string memory,
            string memory,
            string memory,
            uint,
            uint,
            uint,
            uint,
            ProductStatus,
            ProductCondition
        )
    {
        address seller = productIdInStore[_productId];
        Product memory product = stores[seller][_productId];
        return (
            product.id,
            product.name,
            product.category,
            product.imageLink,
            product.descLink,
            product.auctionStartTime,
            product.auctionEndTime,
            product.startPrice,
            product.totalBids,
            product.status,
            product.condition
        );
    }

    // 生成密钥
    function keccak(
        string memory _amount,
        string memory _secret
    ) public pure returns (bytes32) {
        bytes32 _bid = keccak256(abi.encode(_amount, _secret));
        return _bid;
    }
}
