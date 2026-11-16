import {
  addCustomerCartItem, getCatalogueProduct, getCustomizerOptions, getCustomerCart,
  listCatalogue, priceCustomization, removeCustomerCartItem, updateCustomerCartQuantity,
} from '../services/catalogueService.js';

function handler(operation, respond = (res, result) => res.json(result)) {
  return async (req, res, next) => {
    try { respond(res, await operation(req)); } catch (error) { next(error); }
  };
}

export const catalogueList = handler(() => listCatalogue());
export const catalogueDetail = handler((req) => getCatalogueProduct(req.params.id));
export const customizerOptions = handler(() => getCustomizerOptions());
export const customizerPrice = handler((req) => priceCustomization(req.validatedBody));
export const cartGet = handler((req) => getCustomerCart(req.auth.userId));
export const cartAddItem = handler((req) => addCustomerCartItem(req.auth.userId, req.validatedBody));
export const cartUpdateItem = handler((req) => updateCustomerCartQuantity(req.auth.userId, req.params.itemId, req.validatedBody.quantity));
export const cartRemoveItem = handler((req) => removeCustomerCartItem(req.auth.userId, req.params.itemId));
