import { Component, OnInit, Input } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { DataService } from '../services/data.service';
import { ResponseDocument, ExecuteResponse } from '../model/execute-response';
import { HttpGetService } from '../services/http-get.service';
import { AppSettings } from '../model/app-setting';

declare var WpsService: any;

@Component({
  selector: 'app-response',
  templateUrl: './response.component.html',
  styleUrls: ['./response.component.scss']
})
export class ResponseComponent implements OnInit {
  @Input() disabled: boolean;
  @Input() expanded: boolean;
  @Input() addLayerOnMap;
  @Input() addWMSLayerOnMap;

  executeResponse: ExecuteResponse;
  responseDocument: ResponseDocument;
  webProcessingService: any;
  error: {
    textStatus: string;
    errorThrown: string;
  };

  appSettings: AppSettings = undefined;
  executionPressed: boolean;
  responseDocumentAvailable: boolean;
  wpsExecuteLoading: boolean = false;
  refreshInProgress: boolean = false;
  btn_autorefresh_icon: string = "loop";
  refreshing: boolean = false;
  fetchingReferencedOutputs: boolean = false;
  btn_refresh_color: string = "primary";
  refreshInterval: number = 5000;

  constructor(translate: TranslateService, private dataService: DataService, private httpGetService: HttpGetService) {
    this.dataService.webProcessingService$.subscribe(
      wps => {
        this.webProcessingService = wps;
      }
    )
    this.dataService.expandedPanel$.subscribe(
      panel => {
        if (panel === 3) {
          this.expanded = true;
        } else {
          this.expanded = false;
        }
      }
    )
    this.dataService.executeResponse$.subscribe(
      executeResponse => {
        this.executeResponse = executeResponse;
        this.executionPressed = true;
        if (this.executeResponse != undefined) {
          this.responseDocumentAvailable = true;
          this.responseDocument = this.executeResponse.responseDocument;
        } else {
          this.responseDocument = undefined;
        }
      }
    )
    this.dataService.wpsExecuteLoading$.subscribe(
      executeLoading => {
        this.wpsExecuteLoading = executeLoading;
      }
    )
  }

  ngOnInit() {
    this.dataService.errorResponse$.subscribe(
      error => {
        this.error = error;
        this.disabled = false;
      }
    )
    this.httpGetService.getAppSettings()
      .subscribe((settings: AppSettings) => {
        this.appSettings = settings;
        if (this.appSettings.asyncAutoRefreshInterval != undefined && typeof this.appSettings.asyncAutoRefreshInterval == 'number') {
          this.refreshInterval = this.appSettings.asyncAutoRefreshInterval;
        } else {
          this.refreshInterval = 5000;
        }
      })
  }

  refresh() {
    let jobId = this.responseDocument.jobId;
    if (this.responseDocument.version && this.responseDocument.version == "1.0.0") {
      let documentLocation = this.responseDocument.statusLocation;
      this.webProcessingService.parseStoredExecuteResponse_WPS_1_0((resp) => {
        this.refreshInProgress = false;
        if (resp.executeResponse) {
          this.executeResponse = resp.executeResponse;
          this.responseDocument = this.executeResponse.responseDocument;
          let jobId = this.executeResponse.responseDocument.jobId;
          if (this.responseDocument.status != undefined
            && this.responseDocument.status.info != undefined
            && this.responseDocument.status.info.includes('percentCompleted:')) {
            this.responseDocument.percentCompleted =
              this.responseDocument.status.info.substring(
                this.responseDocument.status.info.indexOf('percentCompleted:') + 17);
          }
          for (let output of this.responseDocument.outputs) {
            if (output.data.complexData && output.data.complexData != undefined) {
              let complexData = output.data.complexData;
              if (complexData.mimeType
                && complexData.mimeType != undefined
                && complexData.mimeType == 'application/vnd.geo+json') {
                let geojsonOutput = JSON.parse(complexData.value);
                for (let feature of geojsonOutput.features) {
                  feature.properties['OUTPUT'] = output.identifier;
                }
                this.addLayerOnMap(output.identifier, geojsonOutput, false, jobId);
              }
            }
          }
        }
      }, documentLocation);
    } else {
      this.webProcessingService.getStatus_WPS_2_0((response: any) => {
        this.refreshInProgress = false;
        this.executeResponse = response.executeResponse;
        this.responseDocument = this.executeResponse.responseDocument;
        if (this.responseDocument.status == 'Failed') {
          this.dataService.setResponseError({
            "textStatus": "error",
            "errorThrown": ""
          });
        } else {
          this.dataService.setResponseError(undefined);
        }
      }, jobId);
    }
  }

  refreshingAutomatically() {
    if (this.responseDocument.status != 'Succeeded'
      && (this.responseDocument.status != undefined && this.responseDocument.status.info != 'wps:ProcessSucceeded')
      && this.responseDocument.status != 'Failed') {
      if (!this.refreshing) {
        this.refreshing = true;
        this.animateRefreshing();
      }
      if (this.refreshing) {
        this.refresh();
      }
      setTimeout(() => {
        if (this.refreshing) {
          this.refreshInProgress = true;
          this.refreshingAutomatically();
        }
      }, this.refreshInterval);
    } else {
      this.refreshing = false;
      this.refreshInProgress = false;
      this.btn_refresh_color = "primary";
      if (this.responseDocument.status == 'Failed') {
        this.dataService.setResponseError({
          "textStatus": "error",
          "errorThrown": ""
        });
      } else {
        this.dataService.setResponseError(undefined);
      }
    }
  }

  btn_onRefreshStatusAutomatically() {
    if (this.refreshing) {
      this.refreshing = !this.refreshing;
      console.log("refreshing canceled.");
      this.btn_refresh_color = "primary";
    } else {
      this.btn_refresh_color = "accent";
      this.refreshingAutomatically();
      console.log("refreshing started.");
    }
  }

  animateRefreshing() {
    if (this.refreshing) {
      if (this.responseDocument.status != 'Succeeded'
        && (this.responseDocument.status != undefined && this.responseDocument.status.info != 'wps:ProcessSucceeded')
        && this.responseDocument.status != 'Failed') {
        setTimeout(() => {
          if (this.btn_autorefresh_icon === "loop") {
            this.btn_autorefresh_icon = "cached";
          } else {
            this.btn_autorefresh_icon = "loop";
          }
          this.animateRefreshing();
        }, 250);
      } else {
        this.refreshing = false;
        this.refreshInProgress = false;
        if (this.responseDocument.status == 'Failed') {
          this.dataService.setResponseError({
            "textStatus": "error",
            "errorThrown": ""
          });
        } else {
          this.dataService.setResponseError(undefined);
        }
      }
    }
  }

  btn_onRefreshStatus() {
    this.refresh();
  }

  unCDATAOutput(outputvalue) {
    let trimmedStart = outputvalue.replace("<![CDATA[", "");
    let trimmedEnd = trimmedStart.replace("]]>", "");
    return trimmedEnd;
  }

  btn_onGetResult() {
    let jobId = this.responseDocument.jobId;
    this.webProcessingService.getResult_WPS_2_0((resp) => {
      this.executeResponse = resp.executeResponse;
      this.responseDocument = this.executeResponse.responseDocument;
      let jobId = this.executeResponse.responseDocument.jobId;
      // add outputs as layers:
      for (let output of this.executeResponse.responseDocument.outputs) {
        if (output.reference == undefined && output.data.complexData && output.data.complexData != undefined) {
          let complexData = output.data.complexData;
          if (complexData.mimeType
            && complexData.mimeType != undefined
            && complexData.mimeType == 'application/vnd.geo+json') {
            if (complexData.value.startsWith('<![CDATA[')) {
              complexData.value = this.unCDATAOutput(complexData.value);
            }
            let geojsonOutput = JSON.parse(complexData.value);
            for (let feature of geojsonOutput.features) {
              feature.properties['OUTPUT'] = output.identifier;
            }
            this.addLayerOnMap(output.identifier, geojsonOutput, false, jobId);
          } else if (complexData.mimeType
            && complexData.mimeType != undefined
            && complexData.mimeType == 'application/WMS') {
            // get wms URL:
            if (complexData.value.startsWith('<![CDATA[')) {
              complexData.value = this.unCDATAOutput(complexData.value);
            }
            let wmsTargetUrl = complexData.value;
            // encode URL:
            let regex = new RegExp("[?&]" + "layers" + "(=([^&#]*)|&|#|$)");
            let resultsArray = regex.exec(wmsTargetUrl);
            let layerNamesString = decodeURIComponent(resultsArray[2].replace(/\+/g, " "));
            let wmsBaseUrl = wmsTargetUrl.split("?")[0];
            wmsBaseUrl = wmsBaseUrl + '?';
            let wmsLayer = {
              name: 'Output: ' + output.identifier,
              type: 'wms',
              visible: true,
              url: wmsBaseUrl,
              layerParams: {
                layers: layerNamesString,
                format: 'image/png',
                transparent: true
              }
            }
            this.addWMSLayerOnMap(wmsBaseUrl, layerNamesString, 'Output: ' + output.identifier, jobId);
          }
        }
      }
    }, jobId);
  }

  btn_fetchAndVisualize(output: any, jobId: string) {
    this.fetchingReferencedOutputs = true;
    this.httpGetService.getReferencedOutput(output.reference.href)
      .subscribe((data: any) => {
        for (let feature of data.features) {
          feature.properties['OUTPUT'] = output.identifier;
        }
        this.addLayerOnMap(output.identifier, data, false, jobId);
        this.fetchingReferencedOutputs = false;
        output.isFetched = true;
      });
  }

  setExpanded = (opened: boolean) => {
    if (opened) {
      this.dataService.setExpandedPanel(3);
    }
  }
}
