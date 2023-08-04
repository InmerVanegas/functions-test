// @ts-check
import { DiscountApplicationStrategy } from "../generated/api";

/**
* @typedef {import("../generated/api").InputQuery} InputQuery
* @typedef {import("../generated/api").FunctionResult} FunctionResult
* @typedef {import("../generated/api").Target} Target
* @typedef {import("../generated/api").ProductVariant} ProductVariant
*/

/**
* @type {FunctionResult}
*/
const EMPTY_DISCOUNT = {
  discountApplicationStrategy: DiscountApplicationStrategy.First,
  discounts: [],
};

export default /**
* @param {InputQuery} input
* @returns {FunctionResult}
*/
  (input) => {
    // Define a type for your configuration, and parse it from the metafield
    /**
    * @type {{
    *  percentage: number
    *  discountTags: string[]
    *  discardedTags: string[]
    *  sessionStatus: string
    * }}
    */
    const configuration = JSON.parse(
      input?.discountNode?.metafield?.value ?? "{}"
    );

    console.error('Aver');
    console.error(configuration.sessionStatus);

    /* if (!configuration.quantity || !configuration.percentage) {
      return EMPTY_DISCOUNT;
    } */

    console.error(input.cart.buyerIdentity?.isAuthenticated);
    const targets = input.cart.lines
      // Use the configured quantity instead of a hardcoded value
      .filter(line => line.merchandise.__typename == "ProductVariant" && !line.merchandise.product.deny && line.merchandise.product.allow)
      .map(line => {
        const variant = /** @type {ProductVariant} */ (line.merchandise);
        return /** @type {Target} */ ({
          productVariant: {
            id: variant.id
          }
        });
      });

    if (configuration.sessionStatus === "Authenticated") {
      console.error('El descuento va hacer aplicado cuando este logueado');
      if (!targets.length) {
        console.error("No cart lines qualify for volume discount.");
        return EMPTY_DISCOUNT;
      }
      if (input.cart.buyerIdentity?.isAuthenticated) {
        console.error('Si va a tener descuento');
        return {
          discounts: [
            {
              targets,
              value: {
                percentage: {
                  // Use the configured percentage instead of a hardcoded value
                  value: configuration.percentage.toString()
                }
              }
            }
          ],
          discountApplicationStrategy: DiscountApplicationStrategy.First
        };
      } else {
        return EMPTY_DISCOUNT;
      }

    } else {
      console.error('El descuento se aplicara cuando no este logueado');
      if (!targets.length) {
        console.error("No cart lines qualify for volume discount.");
        return EMPTY_DISCOUNT;
      }
      return {
        discounts: [
          {
            targets,
            value: {
              percentage: {
                // Use the configured percentage instead of a hardcoded value
                value: configuration.percentage.toString()
              }
            }
          }
        ],
        discountApplicationStrategy: DiscountApplicationStrategy.First
      };
    }



    /* if (input.cart.buyerIdentity?.isAuthenticated) {
      console.error('Si va a tener descuento');
      return {
        discounts: [
          {
            targets,
            value: {
              percentage: {
                // Use the configured percentage instead of a hardcoded value
                value: configuration.percentage.toString()
              }
            }
          }
        ],
        discountApplicationStrategy: DiscountApplicationStrategy.First
      };
    } else if (!targets.length) {
      console.error("No cart lines qualify for volume discount.");
      return EMPTY_DISCOUNT;
    } else {
      return EMPTY_DISCOUNT;
    } */
  };
