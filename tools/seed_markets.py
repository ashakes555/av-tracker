# One-time seed for data/curated/markets.json. After seeding, edit the JSON directly.
import json, sys, os
AV = "av-map-data"  # provenance tag: row imported from github.com/path-avmap/av-map-data events.csv
def M(op, city, metro, state, country, hist, notes="", aliases=None, slug=None):
    slug = slug or city.lower().replace(" ", "-").replace(".", "").replace(",", "")
    return {"id": f"{op}-{slug}", "operator": op, "city": city, "metro": metro,
            "state": state, "country": country, "status_history": [
                {"date": d, "status": s, "source_url": u, **({"note": n} if n else {})}
                for (d, s, u, *rest) in hist for n in [rest[0] if rest else ""]],
            "notes": notes, "avmap_city": aliases or [city]}
TQ3 = "https://assets-ir.tesla.com/tesla-contents/IR/TSLA-Q3-2026-Update.pdf"
TSAFE = "https://www.tesla.com/robotaxi/safety"
markets = [
# ---------------- Waymo ----------------
M("waymo","Phoenix","Phoenix","AZ","US",[
  ("2017-04-25","safety-driver","https://www.technologyreview.com/2017/04/25/152152/waymo-has-invited-the-public-to-hop-into-its-self-driving-cars/","Early Rider program (NDA, safety drivers)"),
  ("2017-11-07","driverless-employees","https://waymo.com/blog/2017/11/waymos-fully-self-driving-vehicles-are-here","First fully driverless (rider-only) operations"),
  ("2020-10-08","paid-public","https://waymo.com/blog/2020/10/waymo-is-opening-its-fully-driverless-service-in-phoenix","Fully driverless service opened to the public")]),
M("waymo","San Francisco Bay Area","San Francisco Bay Area","CA","US",[
  ("2022-12-16","driverless-employees","https://waymo.com/blog/2022/12/wheels-up-for-waymo-as-we-expand","Fully autonomous rides for employees in SF"),
  ("2023-08-21","paid-public","https://waymo.com/blog/2023/08/waymos-next-chapter-in-san-francisco","Paid rider-only rides after CPUC approval; open to all 2024-06-25")],
  notes="Combines av-map-data 'San Francisco' and 'Silicon Valley' (Peninsula/San Jose) services, which Waymo operates as one connected area.",
  aliases=["San Francisco","Silicon Valley"], slug="sf-bay-area"),
M("waymo","Los Angeles","Los Angeles","CA","US",[
  ("2024-03-13","public-driverless","https://waymo.com/blog/2024/03/scaling-waymo-one-safely-across-four-cities-this-year","Free tour rides to waitlist"),
  ("2024-04-10","paid-public","https://www.nbcnews.com/tech/innovation/waymo-will-launch-paid-robotaxi-service-los-angeles-rcna146986","Paid rides began (open to all 2024-11-12)")]),
M("waymo","Austin","Austin","TX","US",[
  ("2025-03-04","paid-public","https://www.cnbc.com/2025/03/04/waymo-uber-begin-offering-robotaxi-rides-in-austin-ahead-of-sxsw.html","Uber-only service")]),
M("waymo","Atlanta","Atlanta","GA","US",[
  ("2025-06-24","paid-public","https://www.uber.com/newsroom/waymo-on-uber-atl/","Uber-only service")]),
M("waymo","Miami","Miami","FL","US",[
  ("2023-09-29","testing","https://www.cbsnews.com/miami/news/waymos-self-driving-cars-on-miami-streets-as-company-tests-in-new-city/"),
  ("2025-11-18","driverless-employees","https://x.com/Waymo/status/1990806862015705559"),
  ("2026-01-22","paid-public","https://www.cnbc.com/2026/01/22/waymo-launches-robotaxi-service-in-miami-extending-us-lead.html","Waitlist; open to all 2026-04-15")]),
M("waymo","Dallas","Dallas","TX","US",[
  ("2025-07-28","announced","https://waymo.com/blog/2025/07/our-next-city-dallas"),
  ("2025-12-02","driverless-employees","https://x.com/Waymo/status/1995976302864580611"),
  ("2026-02-24","paid-public","https://waymo.com/blog/2026/02/dallas-houston-san-antonio-orlando","Waitlist launch")]),
M("waymo","Houston","Houston","TX","US",[
  ("2025-05-28","testing","https://www.axios.com/local/houston/2025/05/28/waymo-houston-cars-test-driverless"),
  ("2025-12-04","driverless-employees","https://x.com/Waymo/status/1996595348207231085"),
  ("2026-02-24","paid-public","https://waymo.com/blog/2026/02/dallas-houston-san-antonio-orlando","Waitlist launch")]),
M("waymo","San Antonio","San Antonio","TX","US",[
  ("2025-05-27","testing","https://www.axios.com/local/san-antonio/2025/05/27/waymo-san-antonio-cars-test-drive-downtown"),
  ("2025-12-10","driverless-employees","https://x.com/Waymo/status/1998875372163600672"),
  ("2026-02-24","paid-public","https://waymo.com/blog/2026/02/dallas-houston-san-antonio-orlando","Waitlist launch; open to all 2026-10-14")]),
M("waymo","Orlando","Orlando","FL","US",[
  ("2025-05-27","testing","https://x.com/Waymo/status/1927396004606701883"),
  ("2025-12-11","driverless-employees","https://x.com/Waymo/status/1999237761434345487"),
  ("2026-02-24","paid-public","https://waymo.com/blog/2026/02/dallas-houston-san-antonio-orlando","Waitlist; open to all 2026-04-15")]),
M("waymo","Nashville","Nashville","TN","US",[
  ("2025-03-24","testing","https://www.wkrn.com/news/local-news/nashville/waymo-to-begin-testing-autonomous-vehicles-in-nashville/"),
  ("2026-02-09","driverless-employees","https://www.reuters.com/business/autos-transportation/waymo-goes-fully-autonomous-nashville/"),
  ("2026-04-07","paid-public","https://techcrunch.com/2026/04/07/waymo-opens-robotaxi-service-in-nashville-partners-with-lyft/","11th US city; ~60 sq mi")]),
M("waymo","Denver","Denver","CO","US",[
  ("2025-09-03","testing","https://www.cbsnews.com/colorado/news/waymo-self-driving-cars-denver-colorado-governors-safety/"),
  ("2026-09-01","paid-public","https://techcrunch.com/2026/09/01/waymo-accelerates-robotaxi-expansion-with-launches-in-denver-san-diego-and-tampa/","Rolling invites; Ojai only")]),
M("waymo","San Diego","San Diego","CA","US",[
  ("2025-01-29","testing","https://www.cbs8.com/article/news/local/waymo-comes-to-san-diego/509-c9ba8f17-bada-457a-ad"),
  ("2026-09-01","paid-public","https://techcrunch.com/2026/09/01/waymo-accelerates-robotaxi-expansion-with-launches-in-denver-san-diego-and-tampa/","Rolling invites; open to all 2026-10-14")]),
M("waymo","Tampa","Tampa","FL","US",[
  ("2025-11-20","announced","https://waymo.com/blog/?modal=short-get-ready-tampa-were-laying-the-groundwork-to-serve-you"),
  ("2026-09-01","paid-public","https://techcrunch.com/2026/09/01/waymo-accelerates-robotaxi-expansion-with-launches-in-denver-san-diego-and-tampa/","Rolling invites; open to all 2026-10-14")]),
M("waymo","Las Vegas","Las Vegas","NV","US",[
  ("2025-01-29","testing","https://news3lv.com/news/local/waymo-to-begin-testing-self-driving-vehicles-in-las-vegas"),
  ("2026-09-14","paid-public","https://techcrunch.com/2026/09/14/waymo-opens-robotaxi-service-in-las-vegas/","Rolling invites; ~24 sq mi; Ojai")]),
M("waymo","Detroit","Detroit","MI","US",[("2017-10-26","testing","https://waymo.com/blog/2017/10/michigan-is-waymos-winter-wonderland","Winter testing"),("2025-11-03","announced","https://fox5sandiego.com/news/local-news/san-diego/waymo-san-diego-las-vegas-detroit/")]),
M("waymo","New Orleans","New Orleans","LA","US",[("2025-02-07","testing","https://bizneworleans.com/waymo-to-test-driverless-vehicles-in-new-orleans-during-mardi-gras/")]),
M("waymo","Washington","Washington","DC","US",[("2025-03-25","announced","https://www.reuters.com/technology/alphabets-waymo-aims-2026-self-driving-ride-hailing-launch-washington-dc-2025-03-25/","DC law does not yet allow fully driverless operation")], slug="washington-dc"),
M("waymo","Boston","Boston","MA","US",[("2025-05-19","testing","https://www.cambridgema.gov/Departments/transportation/News/2025/05/waymotesting")]),
M("waymo","Seattle","Seattle","WA","US",[("2025-09-02","testing","https://www.geekwire.com/2025/waymo-to-start-testing-and-laying-groundwork-for-driverless-service-in-seattle/")]),
M("waymo","New York City","New York","NY","US",[("2025-08-22","testing","https://techcrunch.com/2025/08/22/waymo-approved-to-start-autonomous-vehicle-testing-in-new-york-city/","Up to 8 vehicles, safety drivers")], slug="new-york"),
M("waymo","Philadelphia","Philadelphia","PA","US",[("2025-07-07","testing","https://www.cnbc.com/2025/07/07/waymo-to-begin-testing-in-philadelphia-with-drivers-behind-the-wheel.html")]),
M("waymo","Buffalo","Buffalo","NY","US",[("2024-02-01","testing","https://www.wkbw.com/news/local-news/inside-the-self-driving-cars-youve-been-seeing-around-buffalo")]),
M("waymo","Minneapolis","Minneapolis","MN","US",[("2025-11-20","announced","https://waymo.com/blog/?modal=short-were-lacing-up-our-skates-and-laying-the-early-groundwork")]),
M("waymo","St. Louis","St. Louis","MO","US",[("2025-12-03","announced","https://waymo.com/blog/?modal=short-entering-st-louis")], slug="st-louis"),
M("waymo","Pittsburgh","Pittsburgh","PA","US",[("2025-12-03","announced","https://waymo.com/blog/?modal=short-waymo-coming-to-pittsburgh")]),
M("waymo","Baltimore","Baltimore","MD","US",[("2025-12-03","announced","https://waymo.com/blog/?modal=short-waymo-is-heading-to-baltimore")]),
M("waymo","Sacramento","Sacramento","CA","US",[("2026-02-05","testing","https://waymo.com/blog/2026/02/waymo-is-headed-to-sacramento/","Manual mapping")]),
M("waymo","Chicago","Chicago","IL","US",[("2026-02-25","testing","https://waymo.com/blog/2026/02/chicago-expansion","Manual mapping")]),
M("waymo","Charlotte","Charlotte","NC","US",[("2026-02-25","testing","https://waymo.com/blog/2026/02/charlotte-expansion","Manual mapping")]),
M("waymo","Toronto","Toronto","ON","CA",[("2026-10-16","testing","https://waymo.com/blog/2026/10/waymo-in-toronto/","Manual driving under Ontario AV Pilot; service targeted 2028")]),
# ---------------- Tesla ----------------
M("tesla","Austin","Austin","TX","US",[
  ("2025-06-22","safety-driver","https://www.cnbc.com/2025/06/20/tesla-robotaxi-launch-austin.html","Paid, invite-only; safety monitor in passenger seat"),
  ("2026-01-22","paid-public",TSAFE,"First miles with no safety monitor in the car (start of Tesla Robotaxi Safety Report window); mixed fleet")]),
M("tesla","Bay Area","San Francisco Bay Area","CA","US",[
  ("2025-07-31","safety-driver","https://www.businessinsider.com/teslas-ride-hailing-service-live-in-san-francisco-musk-says-2025-7","Safety driver in driver's seat; still supervised per Q3 2026 update")], slug="bay-area"),
M("tesla","Dallas","Dallas","TX","US",[
  ("2026-04-18","paid-public","https://techcrunch.com/2026/04/18/tesla-brings-its-robotaxi-service-to-dallas-and-houston/","Launched without safety monitors")]),
M("tesla","Houston","Houston","TX","US",[
  ("2026-04-18","paid-public","https://techcrunch.com/2026/04/18/tesla-brings-its-robotaxi-service-to-dallas-and-houston/","Launched without safety monitors")]),
M("tesla","Miami","Miami","FL","US",[("2026-07-03","paid-public",TQ3,"Unsupervised since Jul 3 per Q3 2026 update; first safety-report week 2026-06-29")]),
M("tesla","Orlando","Orlando","FL","US",[("2026-07-21","paid-public",TQ3,"Unsupervised since Jul 21 per Q3 2026 update")]),
M("tesla","Tampa","Tampa","FL","US",[("2026-07-21","paid-public",TQ3,"Unsupervised since Jul 21 per Q3 2026 update")]),
M("tesla","Phoenix","Phoenix","AZ","US",[
  ("2025-11-17","announced","https://techcrunch.com/2025/11/18/tesla-receives-ride-hailing-permit-in-arizona-in-last-regulatory-step/","AZ TNC permit"),
  ("2026-10-21","announced",TSAFE,"Listed 'Coming soon'")]),
M("tesla","Las Vegas","Las Vegas","NV","US",[("2026-10-21","announced",TSAFE,"Listed 'Coming soon'; NV permit Aug 2026")]),
M("tesla","Jacksonville","Jacksonville","FL","US",[("2026-10-21","announced",TSAFE,"Listed 'Coming soon'")]),
M("tesla","San Antonio","San Antonio","TX","US",[("2026-10-21","announced",TSAFE,"Listed 'Coming soon'")]),
# ---------------- Zoox ----------------
M("zoox","Las Vegas","Las Vegas","NV","US",[
  ("2019-10-03","testing","https://techcrunch.com/2019/10/03/self-driving-vehicle-startup-zoox-has-expanded-to-las-vegas/"),
  ("2023-06-16","driverless-employees","https://techcrunch.com/2023/06/27/zoox-begins-testing-robotaxis-on-public-roads-in-las-vegas/"),
  ("2025-09-10","public-driverless","https://techcrunch.com/2025/09/10/zoox-opens-its-las-vegas-robotaxi-service-to-the-public/","Free rides"),
  ("2026-08-10","paid-public","https://techcrunch.com/2026/08/05/zoox-to-start-charging-for-robotaxi-rides-in-las-vegas/","First paid Zoox market (NHTSA exemption)")]),
M("zoox","San Francisco","San Francisco Bay Area","CA","US",[
  ("2017-11-30","testing","https://www.claimsjournal.com/news/west/2017/11/30/281801.htm"),
  ("2024-11-11","driverless-employees","https://www.kron4.com/news/bay-area/zoox-robotaxis-to-begin-testing-on-streets-of-san-francisco/"),
  ("2025-11-18","public-driverless","https://sfstandard.com/2025/11/18/zoox-launches-publicly-san-francisco-kind/","Free rides (waitlist from 2025-09-16)")]),
M("zoox","Austin","Austin","TX","US",[
  ("2024-06-04","testing","https://techcrunch.com/2024/06/05/zoox-to-test-self-driving-cars-in-austin-and-miami/"),
  ("2026-08-05","public-driverless","https://www.reuters.com/business/autos-transportation/amazons-zoox-start-paid-robotaxi-rides-vegas-next-week-2026-08-05/","Reuters: carrying passengers for free; start date of rides unknown (date = report date)")]),
M("zoox","Miami","Miami","FL","US",[
  ("2024-06-04","testing","https://techcrunch.com/2024/06/05/zoox-to-test-self-driving-cars-in-austin-and-miami/"),
  ("2026-08-05","public-driverless","https://www.reuters.com/business/autos-transportation/amazons-zoox-start-paid-robotaxi-rides-vegas-next-week-2026-08-05/","Reuters: carrying passengers for free; start date of rides unknown (date = report date)")]),
M("zoox","Seattle","Seattle","WA","US",[("2021-10-19","testing","https://www.engadget.com/amazon-zoox-autonomous-vehicle-test-seattle-103516733.html")]),
M("zoox","Los Angeles","Los Angeles","CA","US",[("2025-04-08","testing","https://zoox.com/journal/atlanta-expansion-2025/")]),
M("zoox","Atlanta","Atlanta","GA","US",[("2025-05-20","testing","https://zoox.com/journal/atlanta-expansion-2025/")]),
M("zoox","Washington","Washington","DC","US",[("2025-10-01","testing","https://www.therobotreport.com/zoox-tests-self-driving-service-in-washington-d-c/")], slug="washington-dc"),
M("zoox","Phoenix","Phoenix","AZ","US",[("2026-03-24","testing","https://www.therobotreport.com/zoox-begins-testing-purpose-built-robotaxis-phoenix-and-dallas/")]),
M("zoox","Dallas","Dallas","TX","US",[("2026-03-24","testing","https://www.therobotreport.com/zoox-begins-testing-purpose-built-robotaxis-phoenix-and-dallas/")]),
M("zoox","Houston","Houston","TX","US",[("2026-09-01","announced","https://www.cnbc.com/2026/09/01/waymo-and-zoox-expand-into-more-us-markets-as-robotaxi-race-heats-up.html","Testing with supervisors planned to start Sep 2026")]),
M("zoox","San Diego","San Diego","CA","US",[("2026-09-01","announced","https://www.cnbc.com/2026/09/01/waymo-and-zoox-expand-into-more-us-markets-as-robotaxi-race-heats-up.html","Testing with supervisors planned to start Sep 2026")]),
# ---------------- Cruise ----------------
M("cruise","San Francisco","San Francisco Bay Area","CA","US",[
  ("2022-02-01","public-driverless","https://fortune.com/2022/02/01/cruise-robotaxi-self-driving-car-san-francisco/","Public driverless rides (waitlist); paid from mid-2022"),
  ("2023-10-24","ended","https://www.wired.com/story/cruise-robotaxi-self-driving-permit-revoked-california/","CA DMV suspended permits; GM ended robotaxi program Dec 2024")]),
# ---------------- May Mobility ----------------
M("may-mobility","Grand Rapids","Grand Rapids","MI","US",[
  ("2019-07-25","safety-driver","https://www.michiganbusiness.org/press-releases/2019/07/public-private-partners-launch-grand-rapids-autonomous-vehicle-initiative/","Downtown shuttle"),
  ("2022-04-29","ended","https://www.grandrapidsmi.gov/Government/Departments/Mobile-GR/Grand-Rapids-Autonomous-Vehicle-Initiative")], aliases=["Grand Rapids, MI"], slug="grand-rapids-mi"),
M("may-mobility","Arlington","Dallas–Fort Worth","TX","US",[("2021-03-23","safety-driver","https://maymobility.com/locations/arlington-tx/","Arlington RAPID; end date unknown")], aliases=["Arlington, TX"], slug="arlington-tx"),
M("may-mobility","Ann Arbor","Detroit","MI","US",[("2021-10-11","safety-driver","https://maymobility.com/posts/a2go-autonomous-shuttle-service-launches-in-ann-arbor-on-oct-11/","A2Go; end date unknown")], aliases=["Ann Arbor, MI"], slug="ann-arbor-mi"),
M("may-mobility","Grand Rapids","Grand Rapids (MN)","MN","US",[("2022-09-28","safety-driver","https://maymobility.com/posts/may-mobility-and-via-launch-first-rural-transit-program-to-use-autonomous-vehicles/","goMARTI")], aliases=["Grand Rapids, MN"], slug="grand-rapids-mn"),
M("may-mobility","Sun City","Phoenix","AZ","US",[
  ("2023-04-25","safety-driver","https://www.azcentral.com/story/news/local/surprise/2023/05/07/sun-city-self-driving-taxi-service/","av-map-data lists 'Autonomous'; May's first driverless rides were Peachtree Corners (Feb 2025)"),
  ("2025-02-01","ended","https://techcrunch.com/2025/02/12/may-mobility-launches-its-first-driverless-commercial-ride-hailing-service/")], aliases=["Sun City, AZ"], slug="sun-city-az"),
M("may-mobility","Martinez","San Francisco Bay Area","CA","US",[
  ("2024-09-12","safety-driver","https://ccta.net/news/contra-costa-transportation-authority-and-may-mobility-launch-autonomous-vehicle-service/"),
  ("2025-12-31","ended","https://www.facebook.com/ContraCostaTransportationAuthority/photos/1152329803651028/","Pilot concluded after nearly 1,000 rides")], aliases=["Martinez, CA"], slug="martinez-ca"),
M("may-mobility","Peachtree Corners","Atlanta","GA","US",[
  ("2024-10-07","safety-driver","https://maymobility.com/posts/peachtree-corners-launch-autonomous-vehicle-may-mobility-t-mobile/"),
  ("2025-02-16","public-driverless","https://www.iotworldtoday.com/transportation-logistics/may-mobility-launches-first-commercial-driverless-service","First driverless commercial rides")], aliases=["Peachtree Corners, GA"], slug="peachtree-corners-ga"),
M("may-mobility","Atlanta","Atlanta","GA","US",[("2025-09-10","safety-driver","https://maymobility.com/posts/lyft-and-may-mobility-deploy-their-first-autonomous-vehicles-in-atlanta/","On Lyft")]),
# ---------------- Avride ----------------
M("avride","Austin","Austin","TX","US",[("2025-07-17","testing","https://www.kvue.com/article/news/local/avride-self-driving-vehicles-austin-testing-drivers/")]),
M("avride","Dallas","Dallas","TX","US",[
  ("2025-09-04","announced","https://www.reuters.com/business/autos-transportation/autonomous-technology-startup-avride-uber-partner-dallas-robotaxi-2025-09-04/"),
  ("2025-12-03","safety-driver","https://techcrunch.com/2025/12/03/uber-and-avride-launch-robotaxi-service-in-dallas/","On Uber, safety operator onboard")]),
# ---------------- Motional ----------------
M("motional","Las Vegas","Las Vegas","NV","US",[("2026-03-13","safety-driver","https://thenextweb.com/news/uber-relaunches-motional-robotaxis-in-las-vegas","Relaunch on Uber with safety operator; earlier 2018–2024 Lyft/Uber history not yet imported")]),
# ---------------- Nuro ----------------
M("nuro","San Francisco","San Francisco Bay Area","CA","US",[
  ("2025-10-29","announced","https://techcrunch.com/2025/10/29/uber-to-launch-a-premium-robotaxi-service-in-waymos-turf/","Uber + Lucid + Nuro"),
  ("2026-04-13","testing","https://techcrunch.com/2026/04/13/uber-nuro-san-francisco-testing-premium-robotaxi-service/","Uber employee test rides; public launch planned late 2026")]),
# ---------------- MOIA America (VW) ----------------
M("moia","Los Angeles","Los Angeles","CA","US",[
  ("2025-04-24","announced","https://investor.uber.com/news-events/news/press-release-details/2025/Volkswagen-and-Uber-Partner-to-Bring-Autonomous-ID--Buzz-to-Los-Angeles/"),
  ("2026-04-08","testing","https://techcrunch.com/2026/04/08/volkswagen-moia-uber-los-angeles-testing-self-driving-microbuses-id-buzz/","~10 ID. Buzz AD")], aliases=["Los Angeles"]),
M("moia","Orlando","Orlando","FL","US",[("2026-04-24","testing","https://www.prnewswire.com/news-releases/moia-america-to-expand-into-new-us-markets-through-strategic-partnership-with-beep","Validation testing, Lake Nona")]),
]
os.makedirs("data/curated", exist_ok=True)
json.dump(markets, open("data/curated/markets.json","w"), indent=1, ensure_ascii=False)
print(len(markets), "markets")
