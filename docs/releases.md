# Cutting releases

While this project is considered unstable/beta quality, the following steps should be taken:

1. Ensure all changes are merged and that `master` is locally updated.
2. Ensure you're logged in as the `matrixdotorg` npm user (for at least the project). `npm whoami` will tell you this.
3. Run `npm version 0.1.0-beta.15` (using whatever beta number is next).
4. Push `master` and the created `v0.1.0-beta.15` tag
5. Run `npm publish` to update npm
6. Run `npm dist-tag add matrix-widget-api@0.1.0-beta.15 beta` to add the `beta` tag to the npm release.
7. Go to https://github.com/matrix-org/matrix-widget-api/releases/new?tag=v0.1.0-beta.15 and use the following template for the notes:
   ```
   Changes since v0.1.0-beta.14:

   * Add support for disabling modal buttons by default, optionally.
   ```

   **Mark the release as a pre-release.**
8. Publish the release.

Now, for the consumer update steps:

1. `yarn add matrix-widget-api@beta` in the react-sdk, likely on the PR branch that is trying to use the updated dependency.
2. Push the react-sdk changes to `develop` - this is important to keep the lockfile for element-web sane.
3. `yarn add matrix-widget-api@beta` in element-web, double checking that the lockfile upgraded rather than appended the version.
   * The lockfile should not reference any other version of the widget-api. Occasionally, this requires a react-sdk upgrade
     in order to have the correct effect. `yarn upgrade matrix-react-sdk@github:matrix-org/matrix-react-sdk#develop` should
     do the required.
4. Push the element-web changes to `develop`

*Note on why the lockfile version is important*: Dependency resolution works in very strange ways when two versions seemingly
collide, particularly during release builds. Development environments are rarely affected by the conflict, however the inner
workings of depdency resolution can cause webpack to bundle two copies of the widget-api: one which works, and one that doesn't.
Depending on the conditions, the code path which gets the "wrong" version changes. Typically, the Jitsi widget will receive a
different version of the widget-api from the code which involves the react-sdk.
