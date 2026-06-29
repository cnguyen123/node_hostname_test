# Assignment: node-hostname Deployment with Kubernetes

## 1. Overview

In this assignment, we demonstrate how to migrate the NodeJS application `node-hostname` from a single server deployment model to a Kubernetes-based deployment.


The solution covers the main assignment requirements:

* Containerize the NodeJS application using Docker.
* Push the container image to Docker Hub.
* Deploy the application to a Kubernetes cluster.
* Expose the application so that it can be accessed from a browser.
* Demonstrate a rolling update by making a small application change.
* Expose the application through Traefik Ingress.


The experiment was implemented on an `k3s Kubernetes cluster`.

---

## 2. Environment

### Kubernetes Cluster

The application was deployed to an existing k3s cluster with the detail as below:

```bash
kubectl get nodes -o wide
```

Cluster nodes:

```text
NAME   STATUS   ROLES                  AGE    VERSION        INTERNAL-IP      EXTERNAL-IP      OS-IMAGE             CONTAINER-RUNTIME
p06    Ready    control-plane,master   460d   v1.34.5+k3s1   130.239.48.225   130.239.48.225   Ubuntu 22.04.5 LTS   containerd://2.1.5-k3s1
p08    Ready    <none>                 103d   v1.34.5+k3s1   130.239.48.227   <none>           Ubuntu 24.04.4 LTS   containerd://2.1.5-k3s1
p09    Ready    <none>                 103d   v1.34.5+k3s1   130.239.48.228   <none>           Ubuntu 24.04.4 LTS   containerd://2.1.5-k3s1
```


### Container Registry

We use Docker Hub as the container registry.

Initial working image:

```text
docker.io/chanh/node-hostname:0.1.0
```

Updated image used for the rolling update:

```text
docker.io/chanh/node-hostname:0.2.1
```

### Kubernetes Namespace

The application is deployed in a dedicated namespace:

```text
node-hostname
```

---

## 3. Repository Structure

```text
node-hostname/
├── app.js
├── bin/
├── package.json
├── package-lock.json
├── routes/
│   └── index.js
├── Dockerfile
├── .dockerignore
├── k8s/
│   ├── namespace.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   └── ingress.yaml
└── README.md
```

The `k8s/` directory contains the Kubernetes manifests required to deploy the application.

---

## 4. Application Change for Rolling Update

The application route was modified to include a small message field in the JSON response. This change was used to demonstrate a rolling update.

File:

```text
routes/index.js
```

Updated content:

```javascript
var express = require('express');
var router = express.Router();
var os = require('os');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.send({
    message: "Testing for rolling update node-hostname - Chanh Nguyen, 29 June 2026",
    hostname: os.hostname(),
    version: process.env.npm_package_version,
  });
});

module.exports = router;
```

Expected response after the rolling update:

```json
{
  "message": "Testing for rolling update node-hostname - Chanh Nguyen, 29 June 2026",
  "hostname": "node-hostname-...",
  "version": "0.0.1"
}
```

---

## 5. Dockerization

### Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

USER node

CMD ["npm", "start"]
```

### .dockerignore
The `.dockerignore` file prevents unnecessary local files from being copied into the container image.
Its content as:
```dockerignore
node_modules
npm-debug.log
.git
.gitignore
Dockerfile
README.md
k8s
```


---

## 6. Build and Test the Docker Image Locally

Build the image:

```bash
docker build -t docker.io/chanh/node-hostname:0.2.1 .
```

Run the container locally:

```bash
docker run --rm -p 3000:3000 docker.io/chanh/node-hostname:0.2.1
```

Test from another terminal:

```bash
curl http://localhost:3000
```

Expected output:

```json
{
  "message": "Testing for rolling update node-hostname - Chanh Nguyen, 29 June 2026",
  "hostname": "<container-hostname>",
  "version": "0.0.1"
}
```

Push the image to Docker Hub:

```bash
docker push docker.io/chanh/node-hostname:0.2.1
```

---

## 7. Kubernetes Manifests

### 7.1 Namespace

File:

```text
k8s/namespace.yaml
```

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: node-hostname
```

Apply:

```bash
kubectl apply -f k8s/namespace.yaml
```

Verify:

```bash
kubectl get ns node-hostname
```

---

### 7.2 Deployment

File:

```text
k8s/deployment.yaml
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: node-hostname
  namespace: node-hostname
  labels:
    app: node-hostname
spec:
  replicas: 3
  selector:
    matchLabels:
      app: node-hostname
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  template:
    metadata:
      labels:
        app: node-hostname
    spec:
      containers:
        - name: node-hostname
          image: docker.io/chanh/node-hostname:0.2.1
          imagePullPolicy: Always
          ports:
            - containerPort: 3000
          env:
            - name: PORT
              value: "3000"
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 20
          resources:
            requests:
              cpu: "50m"
              memory: "64Mi"
            limits:
              cpu: "200m"
              memory: "128Mi"
```

Apply:

```bash
kubectl apply -f k8s/deployment.yaml
```

Check rollout:

```bash
kubectl rollout status deployment/node-hostname -n node-hostname
```

Check pods:

```bash
kubectl get pods -n node-hostname -o wide
```

Expected result:

```text
NAME                             READY   STATUS    NODE
node-hostname-...                1/1     Running   p06
node-hostname-...                1/1     Running   p08
node-hostname-...                1/1     Running   p09
```

---

### 7.3 Service

The service exposes the application on port `80` and forwards traffic to the container port `3000`.

File:

```text
k8s/service.yaml
```

```yaml
apiVersion: v1
kind: Service
metadata:
  name: node-hostname
  namespace: node-hostname
spec:
  type: NodePort
  selector:
    app: node-hostname
  ports:
    - name: http
      port: 80
      targetPort: 3000
      nodePort: 30080
```

Apply:

```bash
kubectl apply -f k8s/service.yaml
```

Verify:

```bash
kubectl get svc -n node-hostname
```

Expected result:

```text
NAME            TYPE       CLUSTER-IP      EXTERNAL-IP   PORT(S)
node-hostname   NodePort   ...             <none>        80:30080/TCP
```

Now we run the application to test from the cluster node with:

```bash
curl http://127.0.0.1:30080
```

---

## 8. Traefik Ingress

Check Traefik pods:

```bash
kubectl get pods -n kube-system | grep -i traefik
```

Observed Traefik components:

```text
helm-install-traefik-8nkj8                0/1     Completed
helm-install-traefik-crd-ndm6k            0/1     Completed
svclb-traefik-b5d5d848-n8psh              2/2     Running
svclb-traefik-b5d5d848-vdkql              2/2     Running
svclb-traefik-b5d5d848-wqm9m              2/2     Running
traefik-788bc4688c-xlkk8                  1/1     Running
```

Check Traefik service:

```bash
kubectl get svc -n kube-system | grep -i traefik
```

Observed service:

```text
traefik   LoadBalancer   10.43.231.71   130.239.48.225   80:31210/TCP,443:32685/TCP
```

From these outputs we see that Traefik is available on the cluster node and can route HTTP traffic through Ingress.
So below we will create manifest to use Ingress.
---

### 8.1 Ingress Manifest

File:

```text
k8s/ingress.yaml
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: node-hostname
  namespace: node-hostname
spec:
  ingressClassName: traefik
  rules:
    - host: node-hostname.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: node-hostname
                port:
                  number: 80
```

Apply:

```bash
kubectl apply -f k8s/ingress.yaml
```

Verify:

```bash
kubectl get ingress -n node-hostname
```

Expected result:

```text
NAME            CLASS     HOSTS                 ADDRESS          PORTS
node-hostname   traefik   node-hostname.local   130.239.48.225   80
```

---

### 8.2 Test Ingress from the Cluster Node

On `p06`, the Ingress was tested successfully with:

```bash
curl -H "Host: node-hostname.local" http://127.0.0.1
```

Observed response:

```json
{
  "message": "Testing for rolling update node-hostname - Chanh Nguyen, 29 June 2026",
  "hostname": "node-hostname-88dcfc977-9hcw5",
  "version": "0.0.1"
}
```

The output confirms that the following path works:

```text
p06:80
  -> Traefik
  -> Ingress rule for node-hostname.local
  -> node-hostname Service
  -> node-hostname Pods
```

---

## 9. Browser Access

### 9.1 Direct Browser Access

For normal direct browser access, the local machine should resolve `node-hostname.local` to the external IP of the cluster node.

On the local machine:

```bash
sudo nano /etc/hosts
```

Add:

```text
130.239.48.225 node-hostname.local
```

Then open:

```text
http://node-hostname.local
```

However, in this environment, direct access from the laptop to `130.239.48.225:80` timed out:

```text
connect to 130.239.48.225 port 80 failed: Connection timed out
```

Similarly, direct access to the NodePort `30080` was also blocked externally.
The reason is due to network restrictions on the university server where the cluster is hosted. So we use SSH tunnel to get through as below.
---

### 9.2 Browser Access Through SSH Tunnel


On the laptop:

```bash
ssh -L 8080:127.0.0.1:80 chanh@130.239.48.225
```
We make sure that the tunnel is kept opening

Then either test with curl:

```bash
curl -H "Host: node-hostname.local" http://localhost:8080
```

Or, for browser access, map the hostname locally:

```bash
sudo nano /etc/hosts
```

Add or update:

```text
127.0.0.1 node-hostname.local
```

Then open:

```text
http://node-hostname.local:8080
```

The request path is:

```text
Laptop browser
  -> node-hostname.local:8080
  -> SSH tunnel
  -> p06:80
  -> Traefik
  -> Ingress
  -> Kubernetes Service
  -> node-hostname Pod
```

---

## 10. Rolling Update

Now we perform a rolling update to demonstrate how Kubernetes can deploy a new version gradually.

### 10.1 Initial Stable Version

Initial image:

```text
docker.io/chanh/node-hostname:0.1.0
```

Check current image:

```bash
kubectl get deployment node-hostname -n node-hostname \
  -o jsonpath='{.spec.template.spec.containers[0].image}'; echo
```

Example output:

```text
docker.io/chanh/node-hostname:0.1.0
```

---

### 10.2 Build and Push Updated Version

After modifying `routes/index.js`, a new image was built and pushed:

```bash
docker build -t docker.io/chanh/node-hostname:0.2.1 .
docker push docker.io/chanh/node-hostname:0.2.1
```

---

### 10.3 Apply Rolling Update

```bash
kubectl set image deployment/node-hostname \
  node-hostname=docker.io/chanh/node-hostname:0.2.1 \
  -n node-hostname
```

Watch rollout:

```bash
kubectl rollout status deployment/node-hostname -n node-hostname
```

Successful rollout result:

```text
deployment "node-hostname" successfully rolled out
```

Verify pods:

```bash
kubectl get pods -n node-hostname -o wide
```

Verify image:

```bash
kubectl get deployment node-hostname -n node-hostname \
  -o jsonpath='{.spec.template.spec.containers[0].image}'; echo
```

Expected:

```text
docker.io/chanh/node-hostname:0.2.1
```

Test application:

```bash
curl -H "Host: node-hostname.local" http://127.0.0.1
```

Expected response:

```json
{
  "message": "Testing for rolling update node-hostname - Chanh Nguyen, 29 June 2026",
  "hostname": "node-hostname-...",
  "version": "0.0.1"
}
```

---

## 11. Verification Results

Finally, we use the following commands to verify that the application was successfully deployed and running in the Kubernetes cluster.

### 11.1 Verify all Kubernetes resources in the application namespace

Command:

```bash
kubectl get all -n node-hostname
```

Observed output:

```text
NAME                                 READY   STATUS    RESTARTS   AGE
pod/node-hostname-5496d9b799-b7pkd   1/1     Running   0          8m2s
pod/node-hostname-5496d9b799-ghw76   1/1     Running   0          8m2s
pod/node-hostname-5496d9b799-w4gqm   1/1     Running   0          8m2s

NAME                    TYPE       CLUSTER-IP     EXTERNAL-IP   PORT(S)        AGE
service/node-hostname   NodePort   10.43.140.67   <none>        80:30080/TCP   7m23s

NAME                            READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/node-hostname   3/3     3            3           8m4s

NAME                                       DESIRED   CURRENT   READY   AGE
replicaset.apps/node-hostname-5496d9b799   3         3         3       8m3s
```

The output confirms that:

* The `node-hostname` Deployment is running.
* The desired number of replicas is `3`.
* All `3` replicas are available.
* The Service exposes the application using `NodePort` on port `30080`.

---

### 11.2 Verify pod placement across cluster nodes

Command:

```bash
kubectl get pods -n node-hostname -o wide
```

Observed output:

```text
NAME                             READY   STATUS    RESTARTS   AGE     IP            NODE   NOMINATED NODE   READINESS GATES
node-hostname-5496d9b799-b7pkd   1/1     Running   0          8m37s   10.42.3.87    p09    <none>           <none>
node-hostname-5496d9b799-ghw76   1/1     Running   0          8m37s   10.42.1.105   p08    <none>           <none>
node-hostname-5496d9b799-w4gqm   1/1     Running   0          8m37s   10.42.0.223   p06    <none>           <none>
```

The output confirms that the 3 application replicas are distributed across the three cluster nodes:

* `p06`
* `p08`
* `p09`

which showing an improvement on availability compared with running the application on a single server.

---

### 11.3 Verify Deployment configuration

Command:

```bash
kubectl describe deployment node-hostname -n node-hostname
```

Observed output:

```text
Name:                   node-hostname
Namespace:              node-hostname
CreationTimestamp:      Mon, 29 Jun 2026 12:53:48 +0200
Labels:                 app=node-hostname
Annotations:            deployment.kubernetes.io/revision: 1
Selector:               app=node-hostname
Replicas:               3 desired | 3 updated | 3 total | 3 available | 0 unavailable
StrategyType:           RollingUpdate
MinReadySeconds:        0
RollingUpdateStrategy:  1 max unavailable, 1 max surge
Pod Template:
  Labels:  app=node-hostname
  Containers:
   node-hostname:
    Image:      docker.io/chanh/node-hostname:0.1.0
    Port:       3000/TCP
    Host Port:  0/TCP
    Limits:
      cpu:     200m
      memory:  128Mi
    Requests:
      cpu:      50m
      memory:   64Mi
    Liveness:   http-get http://:3000/ delay=10s timeout=1s period=20s #success=1 #failure=3
    Readiness:  http-get http://:3000/ delay=5s timeout=1s period=10s #success=1 #failure=3
    Environment:
      PORT:        3000
    Mounts:        <none>
  Volumes:         <none>
  Node-Selectors:  <none>
  Tolerations:     <none>
Conditions:
  Type           Status  Reason
  ----           ------  ------
  Available      True    MinimumReplicasAvailable
  Progressing    True    NewReplicaSetAvailable
OldReplicaSets:  <none>
NewReplicaSet:   node-hostname-5496d9b799 (3/3 replicas created)
Events:
  Type    Reason             Age    From                   Message
  ----    ------             ----   ----                   -------
  Normal  ScalingReplicaSet  8m51s  deployment-controller  Scaled up replica set node-hostname-5496d9b799 from 0 to 3
```

The output confirms that:

* The Deployment uses the `RollingUpdate` strategy.
* The Deployment has `3` desired replicas.
* All `3` replicas are available.
* CPU and memory requests/limits are configured.
* Readiness and liveness probes are configured.
* The application listens on port `3000`.

Note: this captured output was from the initial deployment using image `docker.io/chanh/node-hostname:0.1.0`. After the successful rolling update, the image should be verified again with:

```bash
kubectl get deployment node-hostname -n node-hostname \
  -o jsonpath='{.spec.template.spec.containers[0].image}'; echo
```

Expected final image:

```text
docker.io/chanh/node-hostname:0.2.1
```

---

### 11.4 Verify application logs

Command:

```bash
kubectl logs -n node-hostname deployment/node-hostname
```

Observed output:

```text
Found 3 pods, using pod/node-hostname-5496d9b799-b7pkd

> node-hostname@0.0.1 start
> node ./bin/www

GET / 200 7.638 ms - 63
GET / 200 1.270 ms - 63
GET / 200 0.967 ms - 63
GET / 200 1.235 ms - 63
GET / 200 0.628 ms - 63
GET / 200 0.633 ms - 63
GET / 200 0.669 ms - 63
GET / 200 0.984 ms - 63
GET / 200 0.636 ms - 63
GET / 200 1.241 ms - 63
GET / 200 0.680 ms - 63
GET / 200 0.927 ms - 63
GET / 200 0.638 ms - 63
GET / 200 0.671 ms - 63
GET / 200 0.673 ms - 63
GET / 200 0.615 ms - 63
GET / 200 0.659 ms - 63
GET / 200 0.699 ms - 63
GET / 200 0.696 ms - 63
```

The output confirms that the application is receiving HTTP requests and returning successful `200 OK` responses.

---

### 11.5 Verify Service endpoints

Command:

```bash
kubectl get endpoints -n node-hostname node-hostname
```

Observed output:

```text
Warning: v1 Endpoints is deprecated in v1.33+; use discovery.k8s.io/v1 EndpointSlice
NAME            ENDPOINTS                                           AGE
node-hostname   10.42.0.223:3000,10.42.1.105:3000,10.42.3.87:3000   9m1s
```

The output confirms that the Kubernetes Service correctly discovers all 3 backend Pods:

* `10.42.0.223:3000`
* `10.42.1.105:3000`
* `10.42.3.87:3000`




---

### 11.6 Verify application response

The application was tested from the cluster node.

For NodePort access:

```bash
curl http://127.0.0.1:30080
```

Expected response:

```json
{
  "hostname": "node-hostname-...",
  "version": "0.0.1"
}
```

For Ingress access through Traefik:

```bash
curl -H "Host: node-hostname.local" http://127.0.0.1
```

Observed response after the rolling update:

```json
{
  "message": "Testing for rolling update node-hostname - Chanh Nguyen, 29 June 2026",
  "hostname": "node-hostname-88dcfc977-9hcw5",
  "version": "0.0.1"
}
```

The output confirms that the application is reachable through the configured Kubernetes networking path.

---

### 11.7 Verification summary

The verification results show that:

* The application is deployed in the `node-hostname` namespace.
* The Deployment is healthy with `3/3` replicas available.
* Pods are distributed across multiple Kubernetes nodes.
* The Service correctly routes traffic to all backend Pods.
* The application logs show successful HTTP `GET /` requests.
* The application is reachable through NodePort from the cluster node.
* The application is reachable through Traefik Ingress from the cluster node.
* The rolling update was successfully demonstrated with an updated application response.


---

## 12. Cleanup

To remove the application from the cluster:

```bash
kubectl delete namespace node-hostname
```

This removes the Deployment, Service, Ingress, and Pods in the namespace.

---

## 13. What I Have Completed


* Kubernetes cluster used: existing k3s cluster.
* Application containerized with Docker.
* Docker image pushed to Docker Hub.
* Application deployed to Kubernetes.
* Application exposed internally through a Kubernetes Service.
* Application exposed through Traefik Ingress.
* Application tested successfully from the cluster node.
* Browser access demonstrated through SSH tunnel due to external firewall restrictions.
* Rolling update performed successfully.


---

## 14. Production-Quality Improvements

This solution was intentionally kept small and suitable for a time-boxed technical assignment. For a production deployment, I would add the following improvements.


### 14.1 HTTPS

For production, expose the application through HTTPS.

We may setup:

* Real DNS name
* Traefik Ingress
* cert-manager
* Let's Encrypt certificate

Example target URL:



---


### 14.2 CI/CD Pipeline

We should add a CI/CD pipeline to automatically:

* Run tests.
* Build the container image.
* Scan the image for vulnerabilities.
* Push the image to a registry.
* Deploy to Kubernetes using a controlled release process.

Possible tools:

* GitHub Actions
* GitLab CI
* Argo CD
* Flux

---

### 14.3 Private Container Registry

also for production, use a private registry with access control, for example:

* Docker Hub private repository
* GitHub Container Registry
* AWS ECR
* Azure Container Registry
* Google Artifact Registry


---

### 14.4 Autoscaling

More important, we can utilize Horizontal Pod Autoscaler of Kubernetes:

* Scale based on CPU and memory.
* Potentially scale based on request rate or custom metrics.

Example:

```bash
kubectl autoscale deployment node-hostname \
  -n node-hostname \
  --cpu-percent=70 \
  --min=3 \
  --max=10
```

---

### 14.5 Observability

And of course, one of the important and useful aspect of cloud-native ops is observability:

* Structured logging
* Metrics
* Dashboards
* Alerting
* Distributed tracing if the application grows into multiple services

Possible tools:

* Prometheus
* Grafana
* Loki
* OpenTelemetry



---

### 14.6 Helm Packaging

The deployment could be Helm-ified to make it easier to parameterize and reuse.

Example future chart structure:

```text
helm/node-hostname/
├── Chart.yaml
├── values.yaml
└── templates/
    ├── deployment.yaml
    ├── service.yaml
    └── ingress.yaml
```

and allowing deployment with the command:

```bash
helm install node-hostname ./helm/node-hostname \
  --namespace node-hostname \
  --create-namespace
```

