const mapProfiles = (profile) => {
  if (!profile) return null;
  const addressData = profile?.address ?? {};
  const transactions = profile?.transactionsSummary ?? {};

  const profileSquare = {
    contact: {
      temporary_id: profile.id,
      firstname: profile.firstName,
      lastname: profile.lastName,
      email: profile.email,
      sqsp_created_on: profile.createdOn ? new Date(profile.createdOn).getTime() : null,
      sqsp_billing_name: `${profile.firstName} ${profile.lastName}`,
      iscustomer: profile.isCustomer,
      sqsp_billing_address: addressData.address1 ?? '',
      sqsp_billing_address__line_2_: addressData.address2 ?? '',
      sqsp_billing_city: addressData.city ?? '',
      sqsp_billing_state_region: addressData.state ?? '',
      sqsp_billing_country: addressData.countryCode ?? '',
      sqsp_billing_phone: addressData.phone ?? '',
      sqsp_billing_postal_code: addressData.postalCode ?? '',
      
      first_order_submitted_on: transactions.firstOrderSubmittedOn ? new Date(transactions.firstOrderSubmittedOn).getTime() : null,
      last_order_submitted_on: transactions.lastOrderSubmittedOn ? new Date(transactions.lastOrderSubmittedOn).getTime() : null,
      transactionsSummary: transactions
    },
    defaultContactAddress:{
      temporary_id: profile.id,
      firstname: profile.firstName,
      lastname: profile.lastName,
      email: profile.email,
      sqsp_created_on: profile.createdOn ? new Date(profile.createdOn).getTime() : null,
      sqsp_billing_name: `${profile.firstName} ${profile.lastName}`,
      iscustomer: profile.isCustomer,
      address: addressData.address1 ?? '',
      street_address__line_2_: addressData.address2 ?? '',
      city: addressData.city ?? '',
      state: addressData.state ?? '',
      country: addressData.countryCode ?? '',
      phone: addressData.phone ?? '',
      zip: addressData.postalCode ?? '',
      
      first_order_submitted_on: transactions.firstOrderSubmittedOn ? new Date(transactions.firstOrderSubmittedOn).getTime() : null,
      last_order_submitted_on: transactions.lastOrderSubmittedOn ? new Date(transactions.lastOrderSubmittedOn).getTime() : null,
      transactionsSummary: transactions
    }


  };
  return profileSquare;
};

module.exports = { mapProfiles };