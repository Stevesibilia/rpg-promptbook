{{/* The chart's name, as resources and labels use it. */}}
{{- define "rpg-promptbook.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* The name of every resource of the release; the release name when it already holds the chart's. */}}
{{- define "rpg-promptbook.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "rpg-promptbook.selectorLabels" -}}
app.kubernetes.io/name: {{ include "rpg-promptbook.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "rpg-promptbook.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{ include "rpg-promptbook.selectorLabels" . }}
app.kubernetes.io/version: {{ include "rpg-promptbook.tag" . | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
The release the pod runs: the tag CI sets on image.tag (the helmdeploy
component does), then the chart's appVersion. One place, because the server
also reports it as APP_VERSION, and the version it reports must be the image
that runs.
*/}}
{{- define "rpg-promptbook.tag" -}}
{{- .Values.image.tag | default .Chart.AppVersion | toString -}}
{{- end }}

{{- define "rpg-promptbook.image" -}}
{{- printf "%s:%s" .Values.image.repository (include "rpg-promptbook.tag" .) -}}
{{- end }}

{{/* The CloudNativePG cluster. The operator names its Services and Secrets after it: <name>-rw, <name>-app. */}}
{{- define "rpg-promptbook.cnpgClusterName" -}}
{{- printf "%s-db" (include "rpg-promptbook.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{/* The Secret the operator generates for the application user; its `uri` key is the connection string. */}}
{{- define "rpg-promptbook.databaseSecretName" -}}
{{- printf "%s-app" (include "rpg-promptbook.cnpgClusterName" .) -}}
{{- end }}

{{/* The claim the files volume mounts: one made outside the chart, or the chart's own. */}}
{{- define "rpg-promptbook.dataClaimName" -}}
{{- .Values.persistence.existingClaim | default (printf "%s-data" (include "rpg-promptbook.fullname" .)) -}}
{{- end }}
