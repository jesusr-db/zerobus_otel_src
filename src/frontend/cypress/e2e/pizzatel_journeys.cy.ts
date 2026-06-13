// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0
//
// PizzaTel app-validation user journeys (Plan 2a). Drives the rebranded storefront
// end-to-end via the frontend's own Cypress mechanism. Each journey screenshots for evidence.

import { CypressFields, getElementByField } from '../../utils/Cypress';

describe('PizzaTel user journeys', () => {
  // J1 — Happy browse: storefront is rebranded and shows the synth pizza menu
  it('J1: browse the pizza menu', () => {
    cy.visit('/');
    cy.title().should('include', 'PizzaTel');
    getElementByField(CypressFields.HomePage).should('exist');
    getElementByField(CypressFields.ProductCard, getElementByField(CypressFields.ProductList))
      .its('length').should('be.greaterThan', 0);
    cy.screenshot('J1-home');
  });

  // J2 — Open a pizza product detail page
  it('J2: open a pizza product detail', () => {
    cy.intercept('GET', '/api/products/*').as('getProduct');
    cy.visit('/');
    getElementByField(CypressFields.ProductCard).first().click();
    cy.wait('@getProduct');
    getElementByField(CypressFields.ProductDetail).should('exist');
    getElementByField(CypressFields.ProductName).should('exist');
    getElementByField(CypressFields.ProductPrice).should('exist');
    getElementByField(CypressFields.ProductAddToCart).should('exist');
    cy.screenshot('J2-product-detail');
  });

  // J3 + J4 — Add to cart, then checkout to the order-confirmation page
  it('J3+J4: add a pizza to cart and place an order', () => {
    cy.intercept('POST', '/api/cart*').as('addToCart');
    cy.intercept('GET', '/api/cart*').as('getCart');
    cy.intercept('POST', '/api/checkout*').as('placeOrder');

    cy.visit('/');
    getElementByField(CypressFields.ProductCard).first().click();
    getElementByField(CypressFields.ProductAddToCart).click();
    cy.wait('@addToCart');
    cy.wait('@getCart', { timeout: 10000 });
    cy.location('href').should('match', /\/cart$/);
    getElementByField(CypressFields.CartItemCount).should('contain', '1');
    cy.screenshot('J3-cart');

    getElementByField(CypressFields.CheckoutPlaceOrder).click();
    cy.wait('@placeOrder');
    cy.location('href').should('match', /\/checkout/);
    cy.title().should('include', 'Order Confirmed');
    // The confirmation page renders order line items as S.OrderItem (no data-cy hook;
    // the CheckoutItem/checkout-item component is used on the cart form, not here).
    // Validate the order rendered by its product images (also exercises the B2 resolver).
    cy.get('img[src*="/images/products/"]').its('length').should('be.greaterThan', 0);
    cy.screenshot('J4-order-confirmed');
  });
});

export {};
