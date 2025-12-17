This project uses the `release-please` GitHub Action to manage semantic versioning and release notes.

## How to release a new version of the package

### Step 1: Create a new feature or fix

Make changes to the codebase as needed for the new release.

### Step 2: Commit and push changes

Commit your changes to the repository and push them to the default branch.

### Step 3: Automatic Pull Request for versioning

The `release-please` GitHub Action will automatically create a pull request with the versioning changes and updated release notes. Review the changes and merge the pull request.

### Step 4: Publish the package

Once the pull request is merged, the `release-please` GitHub Action will automatically publish the package to the npm registry.
