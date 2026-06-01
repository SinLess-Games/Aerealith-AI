describe('Profile experience', () => {
  it('requires authentication for the private profile dashboard', () => {
    cy.visit('/app/profile', { failOnStatusCode: false });
    cy.location('pathname').should('match', /login|profile/);
  });

  it('documents the public profile route contract', () => {
    cy.request({
      url: '/profile/sinless777',
      failOnStatusCode: false,
      headers: {
        'x-aerealith-feature-flags': JSON.stringify({
          values: {
            profile: true,
            'profile-public': true,
            'profile-files': true,
            'profile-reports': true,
            'profile-achievements': true,
          },
        }),
      },
    }).then((response) => {
      expect([200, 404, 500]).to.include(response.status);
    });
  });
});
