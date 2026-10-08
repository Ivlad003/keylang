# flow placeOrder

- trigger checkout.Model.QuoteManagement.QuoteManagement.placeOrder
  - step promo.Plugin.CouponPlugin.CouponPlugin.aroundSubmit
  - step checkout.Model.QuoteManagement.QuoteManagement.submit
    - step sales.Model.OrderService.OrderService.place
    - step sales.Model.Totals.Totals.collect
    - step checkout.Model.Logger.Logger.log
