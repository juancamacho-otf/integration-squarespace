const config = require("../config");
const mapOrder = (order) => {
if (!order) return null;

const forms = order.formSubmission || [];
const noteItem = forms.find(f => f.label === "Note / Additional Info");
const checkItem = forms.find(f => f.label === "Checkbox");

const shippingLines = order.shippingLines || [];
const firstShippingLine = shippingLines[0] || {};

const fulfillments = order.fulfillments || [];
const firstFulfillment = fulfillments[0] || {};

const discountLines = order.discountLines || [];
const discountCodesString = discountLines.map(d => d.promoCode || d.name).join(', ');

const internalNotes = order.internalNotes || [];
const notesString = internalNotes.map(n => n.content).join(' | ');

const grandTotal = order.grandTotal || {};
const subtotal = order.subtotal || {};
const refundedTotal = order.refundedTotal || {};
const taxTotal = order.taxTotal || {};
const discountTotal = order.discountTotal || {};

const billing = order.billingAddress || {};
const shipping = order.shippingAddress || {};
const formattedDate = (order.createdOn || '').split('T')[0];
const formatName = (first, last) => {
  return [first, last].filter(Boolean).join(' ');
};

let paymentStatus = 'Paid';
const totalVal = parseFloat(grandTotal.value || '0');
const refundVal = parseFloat(refundedTotal.value || '0');

if (refundVal >= totalVal && totalVal > 0) {
  paymentStatus = 'Refunded';
} else if (refundVal > 0) {
  paymentStatus = 'Partial Refund';
}
  const processedLineItems = (order.lineItems || []).map(item => {
    const unitPrice = item.unitPricePaid || {};
    const variants = item.variantOptions || [];
    const variantString = variants.map(v => v.value).join(', ');
    return {
        temporary_id: item.id,
        name: item.productName ?? '',
        price: unitPrice.value ?? '',
        quantity: item.quantity ?? '',
        hs_sku: item.sku ?? '',
        sqsp_lineitm_variant: variantString,
        sqsp_lineitem_fulfillment_status: item.fulfillmentStatus ?? order.fulfillmentStatus ?? '', 
        
        
      
    };
});

const orderSquare = {
  order: {
    temporary_id: order.id,
    hs_order_name: `SQSP-${order.orderNumber}`,
    hs_external_order_id: order.orderNumber,
    hs_billing_address_email: order.customerEmail,
    customerid: order.customerId,
    hs_external_created_date: order.createdOn,
    
    hs_fulfillment_status: order.fulfillmentStatus,
    hs_payment_status: paymentStatus,

    hs_total_price: grandTotal.value ?? '',
    hs_subtotal_price: subtotal.value ?? '',
    hs_shipping_cost: firstShippingLine.amount?.value ?? '',
    hs_tax: taxTotal.value ?? '',
    hs_refund_amount: refundedTotal.value ?? '',
    
    hs_order_discount: discountTotal.value ?? '',
    hs_discount_codes: discountCodesString,

    sqsp_shipping_method: firstShippingLine.method ?? '',
    sqsp_fulfilled_at: firstFulfillment.shipDate ?? '',
    sqsp_paid_at: order.createdOn ?? '',

    channel_type: order.channel ?? '',
    channel_name: order.channelName ?? '',
    channel_order_number: order.id ?? '',

    sqsp_private_notes: notesString,
    checkout_form_note_additional_info: noteItem?.value ?? '',
    sqsp_checkout_form_checkbox: checkItem?.value ?? '',

    hs_billing_address_name: formatName(billing.firstName, billing.lastName),
    hs_billing_address_street: billing.address1 ?? '',
    billing_address2: billing.address2 ?? '',
    hs_billing_address_city: billing.city ?? '',
    hs_billing_address_postal_code: billing.postalCode ?? '',
    hs_billing_address_state: billing.state ?? '',
    hs_billing_address_country: billing.countryCode ?? '',
    hs_billing_address_phone: billing.phone ?? '',

    hs_shipping_address_name: formatName(shipping.firstName, shipping.lastName),
    hs_shipping_address_street: shipping.address1 ?? '',
    sqsp_shipping_address2: shipping.address2 ?? '',
    hs_shipping_address_city: shipping.city ?? '',
    hs_shipping_address_postal_code: shipping.postalCode ?? '',
    hs_shipping_address_state: shipping.state ?? '',
    hs_shipping_address_country: shipping.countryCode ?? '',
    hs_shipping_address_phone: shipping.phone ?? '',
  },
  line_items: processedLineItems,
  deal: {
      temporary_id: order.id,
      sqsp_order_id:order.id,
      dealname: `${formattedDate} ${billing.firstName} ${billing.lastName} ${order.orderNumber}`,
      closedate: order.createdOn,
      amount: grandTotal.value ?? '',
      pipeline: config.hubspot.pipelineId, 
      dealstage: config.hubspot.stages.checkout_completed, 
      shipping_cost: firstShippingLine.amount?.value ?? '',
      tax: taxTotal.value ?? '',
      refund_amount: refundedTotal.value ?? '',
      
  }
};

return orderSquare;
};

module.exports = { mapOrder };
