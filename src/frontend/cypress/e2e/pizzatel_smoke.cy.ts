// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { CypressFields, getElementByField } from '../../utils/Cypress';

describe('PizzaTel rebrand smoke', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('shows the PizzaTel brand and renders pizza-menu product cards', () => {
    // Brand: page title was rebranded from "Otel Demo - Home" to "PizzaTel - Order Pizza"
    cy.title().should('include', 'PizzaTel');

    // Home page + at least one product card from the synth pizza menu (count is
    // intentionally not pinned — the menu has 68 items vs the old 10, and is data-driven)
    getElementByField(CypressFields.HomePage).should('exist');
    getElementByField(CypressFields.ProductCard, getElementByField(CypressFields.ProductList))
      .its('length')
      .should('be.greaterThan', 0);
  });
});
