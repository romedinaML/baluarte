---
name: baluarte-analyze
description: This skill is the process to extract data from figma, proccess the data and works along with the baluarte-remember skill to update the sqlite memory.
allowed-tools:
  - mcp__metalab__figma__connect_account
  - mcp__metalab__figma__test_figma_connection
  - mcp__metalab__figma__get_figma_node
  - mcp__metalab__figma__search_nodes
  - mcp__metalab__figma__get_comments
  - mcp__metalab__figma__download_node_images
  - mcp__metalab__figma__download_file_all_raw_images
  - mcp__metalab__figma_live_get_current_file
  - mcp__metalab__figma_live_get_page_structure
  - mcp__metalab__figma_live_get_node
  - mcp__metalab__figma_live_get_selection
  - mcp__metalab__figma_live_get_styles
  - mcp__metalab__figma_live_get_local_components
---

# baluarte-analyze

Any time the user wants to understand a node, a canvas, a layout from the figma file this skill will be used as the intermediate step to make mcp requests, call baluarte skill and compare existing information with new information. The main goal is to keep the sqlite memory with relevant data, and avoid storing unnecesary garbage fields. This skill will be very interactive along with the user/agent who calls it to validate the intention when processing a url/node-id from figma.

## When to use

- When the user wants to document a page, a layout, a component or a property, and want that data to be consistent inside the baluarte-remember
- When the user wants to update existing data inside the baluarte-remember skill

## When NOT to use

- When the user needs to create code for storybook or any kind of code, unless the user wants to update the database before the creation of the component.
- When the user needs to write inside the directly in the database, that should be the baluarte-remember skill

## Inputs

| Flag                    | Required | Type                                                           | Description                                                                                                                               |
| ----------------------- | -------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `--selection "<value>"` | **yes**  | url \| string                                                  | URL or node-id of the selection from figma                                                                                                |
| `--type "<value>"`      | **yes**  | enum: `Page` \| `Layout` \| `Molecule` \| `Atom` \| `Property` | What kind of entity the target node represents. Drives which `baluarte-remember` table the analysis writes to.                            |
| `--name "<value>"`      | no       | string                                                         | Override name for the entity. When omitted, the skill suggests a name from the Figma node and confirms with the caller before persisting. |
| `--prompt "<value>"`    | no       | string                                                         | Prompt from the user to explain better the intetion when processing the url                                                               |

if --type and --url are not passed then trigger an error and stop the process

### Example invocations

```bash
# Mandatory --type only; --name will be inferred from Figma and confirmed
/baluarte-analyze --selection https://www.figma.com/design/<file-key>?node-id=2011-2674 --type "Atom"

# Both flags supplied — no name confirmation prompt
/baluarte-analyze --selection https://www.figma.com/design/<file-key>?node-id=2011-2618 --type "Layout" --name "DashboardShell"
```

Calling without `--type` is an error: the skill must fail fast with a copy-pasteable example showing the five valid enum values.

## Outputs

Finished: All data has been stored inside baluarte.db. Changes include {Explain new data created}

## Prerequisites

- If the user doesn't provide a name, before writting/modifying anything with baluarte-remember propose a name and ask for the user validation.
- If the node-id does not exist from the responses from baluarte-remember and you are not sure if this is a Page, a Layout, a Component, or a Property make sure to ask the user before doing writing/modifying with baluarte-remember

## Procedure

### Page procedure

If the --type is a Page

1. use the tool mcp**metalab**figma\_\_search_nodes to get the data from figma for the received url
2. extract the figma file id and the figma node id
3. ask to baluarte if this page exists on it's registry

If it does no

## Invariants

TODO — uniqueness rules, idempotency guarantees, dedup keys.

## What NOT to do

TODO
