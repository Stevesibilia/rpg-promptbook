## MODIFIED Requirements

### Requirement: First sync

After the first sign-in on a computer the app SHALL show «Downloading your
projects» with each project, a ✓ once it and its images and tracks are on
this computer, and the size downloaded, files included, and SHALL open
Projects once every project is downloaded. «Start with what is downloaded»
SHALL open Projects at once while the rest go on in the background; a
project whose document is not yet downloaded SHALL show as downloading and
SHALL NOT open until it is.

#### Scenario: Start early

- **WHEN** three of seven projects are downloaded and the user presses Start
  with what is downloaded
- **THEN** Projects lists all seven, the three open, and the other four open
  once downloaded

#### Scenario: Files counted

- **WHEN** the first sync downloads a project of 120 KB with 40 MB of images
- **THEN** its row shows ✓ only once the images are on this computer, and the
  header's size counts them

### Requirement: Settings, This device

On the desktop Settings SHALL have a section This device, at
`/settings/device`, holding: the data folder with Show in Finder (Explorer,
Files), the space used, the number of projects, of local snapshots and of
images and tracks with the space they take; the Local snapshots setting; the
version with Check for updates; and Sign out….

#### Scenario: Show the data folder

- **WHEN** the user presses Show in Finder on a Mac
- **THEN** Finder opens on the app's data folder

#### Scenario: Space of the files

- **WHEN** this computer holds 140 images and tracks taking 1.2 GB
- **THEN** This device's usage line counts them and their 1.2 GB

## ADDED Requirements

### Requirement: Images and tracks on this computer

The app SHALL keep every image and track of every project of the account on
this computer, in the account's folder, named by content hash, downloaded in
the background once a project's document lists them, resumed after an
interruption and checked against their hash. The window SHALL load them from
this computer, online or offline, and never from the network.

#### Scenario: Offline viewing

- **WHEN** the app has synced a project with 12 images and goes offline
- **THEN** the board shows all 12 and the viewer opens each one

#### Scenario: Added on the web

- **WHEN** the user drops four images on the board in the browser while the
  app is online
- **THEN** the app shows them on its board once they are downloaded

### Requirement: Files added offline upload later

Files dropped on the board while offline SHALL be stored on this computer at
once, shown with the badge «on this device», and uploaded when the server is
reachable, retried until they are, across restarts. The board SHALL show «N
files on this computer, uploaded when you are back online.» and the status
bar «Offline · N files waiting to upload». Choosing and editing prompts SHALL
work offline.

#### Scenario: Drop offline, relaunch, reconnect

- **WHEN** the user drops four images offline, quits, relaunches offline, and
  the server comes back
- **THEN** the four images show after the relaunch with «on this device», and
  once uploaded the web client shows them in the same scene

### Requirement: Removing the projects with files waiting

The sign-out dialog SHALL count the files waiting to upload in its red box
when «Also remove the projects from this computer» is ticked, and removing
SHALL delete the files with the rest of the account's folder.

#### Scenario: Files would be lost

- **WHEN** four files wait to upload and the user ticks the removal
- **THEN** the red box says the four files are not yet on the server and the
  button reads «Sign out and remove» in red
