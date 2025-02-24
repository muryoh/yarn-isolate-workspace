Forked from https://github.com/Madvinking/yarn-isolate-workspace :pray:
Hacked in Yarn v2 with node linker support as I needed it to work with Firebase functions deployment from a monorepo using Yarn v2 workspaces (https://github.com/firebase/firebase-tools/issues/653) and bundling was not an option, or at least not fixing everything.

Only tested on my setup, not promising anything:)

# yarn-isolate-workspace

![npm](https://img.shields.io/npm/v/yarn-isolate-workspace)

**Isolate a workspace in yarn workspaces project**
when working in yarn workspaces environment
sometimes some workspaces depend on other workspaces.
this behavior makes it hard to prepare a workspace for a production environment,
since we need to copy all related workspaces along with it.

This tool helps you isolate the workspace.
It will copy all related workspaces to a destination folder under the workspace.
And will make it a root workspace to all the other copied workspaces.
that way, you end up with an isolated project that has everything it needs under one folder

### motivation

using CI/CD to get your project ready for production is extremely tricky with monorepos.
When your monorepo gets too big, and you want to dockerized each service independently,
you want to prevent your docker context scope from the root of the monorepo.
And make the scope for the folder of your workspace/project/service folder.
To achieve it, you need to copy all project dependence workspaces to this folder.

### example

if we have a monorepo workspaces tree that looks like this:

```
├── workspace-1
├   ├── package.json
├   ├── src-code
├── workspace-2
├   ├── package.json
├   ├── src-code
├── package.json
├── .yarnrc
├── yarn.lock
```

and workspace-1 depend on workspace-2
after running
`npx yarn-isolate-workspace workspace-1`
the tree will look like this:

```
├── workspace-1
    ├── _isolated_
        ├── workspaces
            ├── workspace-2
                ├── package.json
                ├── src-code
        ├── workspaces-src-less
            ├── workspace-2
                ├── package.json
        ├── workspaces-src-less-prod
            ├── workspace-2
                ├── package.json
        ├── package.json
        ├── package-prod.json
        ├── .yarnrc
        ├── .yarn.lock
    ├── package.json
    ├── src-code
├── workspace-2
    ├── package.json
    ├── src-code
├── package.json
├── .yarnrc
├── .yarn.lock
```

### what did you get?

the tool created a folder (with default name _isolated_)
this folder contains:

  1. `workspaces` folder - include all the related workspaces and their source code (in the example workspace 2)
  2. `workspaces-src-less` folder - contain all related workspaces by only package.json files.
*** a folder contains all the workspaces package.json (same tree as the workspaces folder).
Usually, when building an image with docker, you want to take advantage of the Docker cache layering.
And to do so, you want to copy all package.json before copying all source code. To create a layer
for all the node_modules. This folder contains only those pacakge.json,
so instead of COPY all package.json one by one, you can COPY this all folder.
  3. `workspaces-src-less-prod` folder - contain all related workspaces that are not in devDependencies and
*** same as the previous folder but each package.json filters out the devDependencis.
same as before if you run yarn install with the --prod flag
  4. `package.json` file - duplication of the main package.json just with an extra key: `workspaces.`
     and all related workspaces are listed there so it could resolve them.
  5. `package-prod.json` file - duplication of the main package.json just with an extra key: `workspaces.`
     and without the devDependencies.
  6. `.yarnrc` - copy if the root scope .yarnrc if exist if not generate the file with workspaces enable flag
  7. `yarn.lock` - if there is a 'yarn.lock' file in the root of the project,
     it will copy all relevant dependencies from it

## Supported cli flags

we can configure the behavior of the isolated script with some params
you want to make sure you treat the depended workspaces as 'installed modules' so filter out from them
their dev-dependencies and test files.

```
  #### yarn-isolate [options] [workspace name to isolate]
    [--yarnrc-disable]                     disable copy or generate .yarnrc file
    [--yarnrc-generate]                    generate yarnrc (instead of copy the existing one)
    [--yarn-lock-disable]                  disable generate yarn.lock file

    [--src-less-disable]                   disable create of the src-less folders
    [--src-less-glob={value}]              glob pattern to include files with the src-less folder
    [--src-less-sub-dev-deps]              include sub workspaces dev dependencies

    [--src-less-prod-disable]              disable create the prod src-less folder
    [--src-less-prod-glob={value}]         glob pattern to include files with the src-less-prod folder

    [--json-file-disable]                  disable create json file
    [--json-file-prod-disable]             disable create json prod json file
    [--output-folder]                      folder to create all generated files (default to _isolated_)
    [--include-root-deps]                  include root workspaces package.json dependencies and dev dependencies

    [--src-files-enable]                   copy all src file of main workspace to the isolated folder
    [--src-files-exclude-glob={value}]     glob pattern to exclude files from the main workspace copied files
    [--src-files-include-glob={value}]     glob pattern to include files from the main workspace copied files
    [--workspaces-exclude-glob={value}]    glob pattern to exclude files when copy workspaces

    [--max-depth]                          by default we search recursively project-root 5 folder
    [--project-folder={value}]             absolute path to project-root (default will look for the root)
```

* `--src-less-glob/--src-less-prod-glob` - if you have bin files or any other files, you need to run yarn install in the workspace. For example, one of our workspaces have a bin script that warps lint command.
* `--src-files-enable` - in case you want to create docker context of the isolated folder.
* `--workspaces-exclude-glob` - filter files from workspaces you don't need test folders, etc.
