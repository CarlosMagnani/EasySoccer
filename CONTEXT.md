# EasySoccer

EasySoccer assists a user with bounded, user-authorized Ultimate Team pack and SBC workflows.

## Language

**Owned Pack**:
A pack already granted to the user's club and available in My Packs. It excludes any pack that would require Coins, Points, or another purchase action.
_Avoid_: Store offer, purchasable pack

**Pack Batch**:
A single user-authorized request to open a chosen quantity of one selected Owned Pack type.
_Avoid_: Auto grind, unlimited opening

**Tradeable Duplicate**:
A newly opened duplicate Item that can be exchanged for Coins through either the Transfer List or Quick Sell.
_Avoid_: Untradeable duplicate

**Allowed Listing Range**:
The minimum and maximum prices at which EA permits an Item to be listed. It validates a listing price but does not estimate the Item's current market value.
_Avoid_: Market price, cheap price

**Market Quote**:
A platform-specific estimate of an Item's current market value, including its source, observation time, and freshness. It must come from an authorized source before it can support an automatic disposition decision.
_Avoid_: Allowed Listing Range, price range

**Net Market Value**:
The selected Market Quote after deducting EA's 5% Transfer Market fee.
_Avoid_: Gross price, displayed market price

**Transfer List Candidate**:
A Tradeable Duplicate whose Net Market Value is greater than its Quick Sell value. It is held on the Transfer List without being offered for sale.
_Avoid_: Listed item, active auction

**Quick Sell Candidate**:
A Tradeable Duplicate whose Quick Sell value is greater than or equal to its Net Market Value.
_Avoid_: Transfer List Candidate
