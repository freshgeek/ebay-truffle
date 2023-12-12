pragma solidity >=0.4.21;

contract Escrow {
    // 托管对应产品id
    uint public productId;

    // 购买者
    address public buyer;
    // 出售者
    address public seller;
    // 第三方仲裁
    address public arbiter;

    // 合约金额
    uint public amount;

    // 对应人的投票；裁判3进2；
    mapping(address => bool) releaseMap;
    uint public releaseCount;

    // 对应人的投票;3进2
    mapping(address => bool) refundMap;
    uint public refundCount;

    // 是否已经处理
    bool public fundsDisbursed;

    // 创建托管合约事件
    event CreateEscrow(
        uint _productId,
        address _buyer,
        address _seller,
        address _arbiter,
        uint _amount
    );

    event UnlockAmountEvent(
        uint _productId,
        string _operation,
        address _operator
    );

    event DisburseAmount(uint _productId, uint _amount, address _beneficiary);

    constructor(
        uint _productId,
        address _buyer,
        address _seller,
        address _arbiter
    ) public payable {
        productId = _productId;
        buyer = _buyer;
        seller = _seller;
        arbiter = _arbiter;
        amount = msg.value;
        fundsDisbursed = false;
        emit CreateEscrow(productId, buyer, seller, arbiter, amount);
    }

    function releaseAmountToSeller(address caller) public {
        require(!fundsDisbursed, "funds already disbursed");
        require(
            caller == seller ||
                caller == arbiter ||
                caller == buyer,
            "  caller is not authorized to call this function"
        );
        if (!releaseMap[caller]) {
            releaseMap[caller] = true;
            releaseCount += 1;
            emit UnlockAmountEvent(
                productId,
                "releaseAmountToSeller",
                caller
            );
        }
        if (releaseCount >= 2) {
            payable(seller).transfer(amount);
            fundsDisbursed = true;
            emit DisburseAmount(productId, amount, seller);
        }
    }

    function refundAmountToBuyer(address caller) public {
        require(!fundsDisbursed, "funds already disbursed");
        require(
            caller == seller ||
                caller == arbiter ||
                caller == buyer,
            "  caller is not authorized to call this function"
        );
        if (!refundMap[caller]) {
            refundMap[caller] = true;
            refundCount += 1;
            emit UnlockAmountEvent(
                productId,
                "refundAmountToBuyer",
                caller
            );
        }
        if (refundCount >= 2) {
            payable(buyer).transfer(amount);
            fundsDisbursed = true;
            emit DisburseAmount(productId, amount, buyer);
        }
    }

    function escrowInfo()
        public
        view
        returns (address, address, address, bool, uint256, uint256)
    {
        return (
            buyer,
            seller,
            arbiter,
            fundsDisbursed,
            releaseCount,
            refundCount
        );
    }
}
