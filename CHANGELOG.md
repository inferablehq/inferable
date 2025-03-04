# Release 2025-02-26

This release includes several new demo implementations, infrastructure
improvements, and SDK updates. Notable additions include new demos for quote
systems and contextual ticket tagging, along with significant changes to queue
workload handling and system logging configurations.

## Changes

### Feature

- Added new quote system demo with complete setup and documentation
- Implemented separate queue workloads with core functionality improvements
- Added contextual ticket tagging demo with single-step and multi-step
  implementations

### Bug Fix

- Disabled HyperDX log collection in observability system

### SDK Release

- Updated Node.js SDK to version 0.30.109

# Release 2025-02-22

This release includes significant improvements to workflow functionality, error
handling, and UI enhancements. Notable additions include a new changelog
generator demo and various fixes for workflow tool management and status
display.

## Changes

### Feature

- Added a changelog generator demo with implementation files including Git
  tools, workflows, and utilities

### Bug Fix

- Enhanced workflow status visualization by displaying job rejections as
  failures in the UI
- Added support for snake_cased workflow names in the system
- Improved workflow tool listing functionality and exact name matching
- Enhanced error messaging for invalid resultSchema configurations

### SDK Release

- Node SDK version updated to 0.30.108

# Release 2025-02-17

Major improvements to workflow management functionality including manual
triggers, timeout handling, and configuration options. Multiple SDK updates and
UI enhancements for better user experience.

## Changes

### Feature

- Added Manual Workflow trigger UI functionality with frontend and routing
  updates
- Added workflow timeout events visualization in the UI
- Implemented tool configuration support during workflow registration

### SDK Release

- Node SDK version updated to 0.30.107

### Bug Fix

- Major refactoring of workflow execution handling with improved filtering and
  status management
- Simplified error handling in Inferable API error class for more flexible error
  response parsing
